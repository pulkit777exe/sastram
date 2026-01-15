"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  REPORT_STATUS,
  REPORT_PRIORITY,
  REPORT_CATEGORY_LABELS,
} from "@/lib/config/constants";
import {
  createReportSchema,
  updateReportStatusSchema,
  resolveReportSchema,
} from "./schemas";
import { createNotification } from "@/modules/notifications/repository";
import { logAction } from "@/modules/audit/repository";
import type { ReportCategory, ReportPriority } from "@prisma/client";

function calculatePriority(
  category: ReportCategory,
  existingReportsCount: number
): ReportPriority {
  if (category === "VIOLENCE_THREATS" || category === "SELF_HARM") {
    return "CRITICAL";
  }

  if (
    category === "HATE_SPEECH" ||
    category === "HARASSMENT" ||
    existingReportsCount >= 2
  ) {
    return "HIGH";
  }

  if (
    ["SPAM", "SCAM_FRAUD", "IMPERSONATION", "PRIVATE_INFO"].includes(category)
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

export async function createReport(data: {
  messageId: string;
  category: string;
  details?: string;
}) {
  const validation = validate(createReportSchema, data);
  if (!validation.success) {
    return { error: validation.error };
  }

  const session = await requireSession();

  try {
    const existingReport = await prisma.report.findFirst({
      where: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
      },
    });

    if (existingReport) {
      return { error: "You have already reported this message" };
    }

    const message = await prisma.message.findUnique({
      where: { id: validation.data.messageId },
      select: {
        id: true,
        senderId: true,
        section: { select: { name: true, slug: true } },
      },
    });

    if (!message) {
      return { error: "Message not found" };
    }

    if (message.senderId === session.user.id) {
      return { error: "You cannot report your own message" };
    }
    const existingReportsCount = await prisma.report.count({
      where: { messageId: validation.data.messageId },
    });

    const priority = calculatePriority(
      validation.data.category as ReportCategory,
      existingReportsCount
    );

    const report = await prisma.report.create({
      data: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
        category: validation.data.category as ReportCategory,
        details: validation.data.details,
        status: REPORT_STATUS.PENDING,
        priority,
      },
    });

    await logAction({
      action: "REPORT_CREATED",
      entityType: "Report",
      entityId: report.id,
      userId: session.user.id,
      details: {
        messageId: validation.data.messageId,
        category: validation.data.category,
        priority,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    revalidatePath("/dashboard/admin/moderation");

    return {
      success: true,
      reportId: report.id,
      priority,
      message: `Thank you for reporting. We'll review this ${
        priority === "CRITICAL"
          ? "immediately"
          : priority === "HIGH"
          ? "within 1 hour"
          : "within 24 hours"
      }.`,
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function getReports(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}) {
  const session = await requireSession();

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return [];
  }

  const limit = Math.min(filters?.limit || 50, 100);
  const offset = filters?.offset || 0;

  try {
    const whereClause: Record<string, unknown> = {};

    if (filters?.status) {
      whereClause.status = filters.status;
    }

    if (filters?.priority) {
      whereClause.priority = filters.priority;
    }

    const reports = await prisma.report.findMany({
      where: whereClause,
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                status: true,
                createdAt: true,
              },
            },
            section: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: limit,
      skip: offset,
    });

    return reports;
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return [];
  }
}

export async function getReportStats() {
  const session = await requireSession();

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return null;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, pending, critical, high, resolvedToday] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: "PENDING" } }),
      prisma.report.count({
        where: { priority: "CRITICAL", status: "PENDING" },
      }),
      prisma.report.count({ where: { priority: "HIGH", status: "PENDING" } }),
      prisma.report.count({
        where: {
          status: { in: ["RESOLVED", "DISMISSED"] },
          resolvedAt: { gte: today },
        },
      }),
    ]);

    return {
      total,
      pending,
      critical,
      high,
      medium: await prisma.report.count({
        where: { priority: "MEDIUM", status: "PENDING" },
      }),
      low: await prisma.report.count({
        where: { priority: "LOW", status: "PENDING" },
      }),
      resolvedToday,
      autoModActions: 0,
    };
  } catch (error) {
    console.error("Failed to fetch report stats:", error);
    return null;
  }
}

export async function getReportWithContext(reportId: string) {
  const session = await requireSession();
  await assertAdmin(session.user);

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                status: true,
                createdAt: true,
                reputationPoints: true,
              },
            },
            section: {
              select: {
                id: true,
                name: true,
                slug: true,
                messageCount: true,
              },
            },
          },
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            reputationPoints: true,
          },
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!report) {
      return { error: "Report not found" };
    }

    const surroundingMessages = await prisma.message.findMany({
      where: {
        sectionId: report.message.section.id,
        createdAt: {
          gte: new Date(report.message.createdAt.getTime() - 5 * 60 * 1000), // 5 min before
          lte: new Date(report.message.createdAt.getTime() + 5 * 60 * 1000), // 5 min after
        },
        deletedAt: null,
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    const violationHistory = await prisma.userBan.findMany({
      where: { userId: report.message.senderId },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        isActive: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const similarReports = await prisma.report.findMany({
      where: {
        messageId: report.messageId,
        id: { not: reportId },
      },
      select: {
        id: true,
        category: true,
        status: true,
        createdAt: true,
      },
    });

    const userBanCount = await prisma.userBan.count({
      where: { userId: report.message.senderId },
    });
    const userReportCount = await prisma.report.count({
      where: {
        message: { senderId: report.message.senderId },
        status: "RESOLVED",
      },
    });
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(report.message.sender.createdAt).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const trustScore = Math.max(
      0,
      Math.min(
        100,
        50 + accountAgeDays * 0.5 - userBanCount * 20 - userReportCount * 5
      )
    );

    return {
      success: true,
      data: {
        ...report,
        categoryLabel:
          REPORT_CATEGORY_LABELS[
            report.category as keyof typeof REPORT_CATEGORY_LABELS
          ],
        threadContext: {
          threadTitle: report.message.section.name,
          threadSlug: report.message.section.slug,
          messageCount: report.message.section.messageCount,
          surroundingMessages: surroundingMessages.map((m) => ({
            id: m.id,
            content: m.content,
            senderId: m.senderId,
            senderName: m.sender.name,
            createdAt: m.createdAt,
            isReported: m.id === report.messageId,
          })),
        },
        reportedUserProfile: {
          id: report.message.sender.id,
          name: report.message.sender.name,
          email: report.message.sender.email,
          createdAt: report.message.sender.createdAt,
          status: report.message.sender.status,
          reputationPoints: report.message.sender.reputationPoints,
          trustScore: Math.round(trustScore),
          violationHistory: violationHistory.map((v) => ({
            id: v.id,
            action: v.isActive ? "Active Ban" : "Past Ban",
            reason: v.reason,
            createdAt: v.createdAt,
          })),
        },
        similarReports,
        reportCount: similarReports.length + 1,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateReportStatusAction(
  reportId: string,
  status: "REVIEWING" | "RESOLVED" | "DISMISSED"
) {
  const session = await requireSession();

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { error: "Unauthorized" };
  }

  const validation = validate(updateReportStatusSchema, { reportId, status });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: validation.data.status as
          | "REVIEWING"
          | "RESOLVED"
          | "DISMISSED",
        resolvedBy:
          status === "RESOLVED" || status === "DISMISSED"
            ? session.user.id
            : null,
        resolvedAt:
          status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    revalidatePath("/dashboard/admin/moderation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getMyReports() {
  const session = await requireSession();

  try {
    const reports = await prisma.report.findMany({
      where: { reporterId: session.user.id },
      include: {
        message: {
          select: {
            id: true,
            content: true,
            section: {
              select: { name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return reports.map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel:
        REPORT_CATEGORY_LABELS[
          r.category as keyof typeof REPORT_CATEGORY_LABELS
        ],
      status: r.status,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      threadName: r.message.section.name,
      messagePreview: r.message.content.substring(0, 100),
    }));
  } catch (error) {
    console.error("Failed to fetch user reports:", error);
    return [];
  }
}

/**
 * Resolve a report with a specific action
 */
export async function resolveReport(data: {
  reportId: string;
  action:
    | "DISMISS"
    | "REMOVE_MESSAGE"
    | "WARN_USER"
    | "SUSPEND_USER"
    | "BAN_USER";
  note: string;
  notifyReporter: boolean;
  duration?: string;
}) {
  const session = await requireSession();

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { error: "Unauthorized" };
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id: data.reportId },
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            section: { select: { id: true, name: true, slug: true } },
          },
        },
        reporter: { select: { id: true, name: true, email: true } },
      },
    });

    if (!report) {
      return { error: "Report not found" };
    }

    // Update report status
    const newStatus = data.action === "DISMISS" ? "DISMISSED" : "RESOLVED";

    await prisma.report.update({
      where: { id: data.reportId },
      data: {
        status: newStatus,
        resolution: data.note,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
      },
    });

    // Execute action based on type
    if (
      data.action === "REMOVE_MESSAGE" ||
      data.action === "WARN_USER" ||
      data.action === "SUSPEND_USER" ||
      data.action === "BAN_USER"
    ) {
      // Soft delete the message
      await prisma.message.update({
        where: { id: report.messageId },
        data: { deletedAt: new Date() },
      });
    }

    if (data.action === "WARN_USER") {
      // Create a warning notification
      await createNotification({
        userId: report.message.senderId,
        type: "SYSTEM",
        title: "Official Warning",
        message: `Your message has been removed for violating community guidelines. Reason: ${data.note}`,
        data: {
          reportId: data.reportId,
          threadSlug: report.message.section.slug,
        },
      });
    }

    if (data.action === "SUSPEND_USER" || data.action === "BAN_USER") {
      // Calculate ban expiry
      let expiresAt: Date | null = null;
      if (data.action === "SUSPEND_USER" && data.duration) {
        const now = new Date();
        const durationMap: Record<string, number> = {
          "1h": 60 * 60 * 1000,
          "6h": 6 * 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "3d": 3 * 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        };
        expiresAt = new Date(
          now.getTime() + (durationMap[data.duration] || 24 * 60 * 60 * 1000)
        );
      }

      // Create ban record
      await prisma.userBan.create({
        data: {
          userId: report.message.senderId,
          bannedBy: session.user.id,
          reason: data.note,
          isActive: true,
          expiresAt,
        },
      });

      // Update user status
      await prisma.user.update({
        where: { id: report.message.senderId },
        data: { status: data.action === "BAN_USER" ? "BANNED" : "SUSPENDED" },
      });

      // Notify banned user
      await createNotification({
        userId: report.message.senderId,
        type: "BAN",
        title:
          data.action === "BAN_USER" ? "Account Banned" : "Account Suspended",
        message:
          data.action === "BAN_USER"
            ? `Your account has been permanently banned. Reason: ${data.note}`
            : `Your account has been suspended until ${expiresAt?.toLocaleDateString()}. Reason: ${
                data.note
              }`,
        data: { reportId: data.reportId, duration: data.duration },
      });
    }

    // Notify reporter if requested
    if (data.notifyReporter) {
      await createNotification({
        userId: report.reporterId,
        type: "REPORT",
        title: "Report Updated",
        message:
          data.action === "DISMISS"
            ? "Your report has been reviewed. No violation was found."
            : "Thank you for your report. Action has been taken.",
        data: { reportId: data.reportId },
      });
    }

    // Log the action
    await logAction({
      action: "REPORT_RESOLVED",
      entityType: "Report",
      entityId: data.reportId,
      userId: report.message.senderId,
      performedBy: session.user.id,
      details: {
        action: data.action,
        note: data.note,
        duration: data.duration,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    revalidatePath("/dashboard/admin/moderation");

    return {
      success: true,
      message: `Report ${
        data.action === "DISMISS" ? "dismissed" : "resolved"
      } successfully`,
    };
  } catch (error) {
    return handleError(error);
  }
}
