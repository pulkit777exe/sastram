"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { REPORT_STATUS } from "@/lib/config/constants";
import { createReportSchema, updateReportStatusSchema } from "./schemas";

export async function createReport(formData: FormData) {
  const messageId = formData.get("messageId") as string;
  const reason = formData.get("reason") as string;

  const validation = validate(createReportSchema, { messageId, reason });
  if (!validation.success) {
    return { error: validation.error };
  }

  const session = await requireSession();

  try {
    // Check if user already reported this message
    const existingReport = await prisma.report.findFirst({
      where: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
      },
    });

    if (existingReport) {
      return { error: "You have already reported this message" };
    }

    await prisma.report.create({
      data: {
        messageId: validation.data.messageId,
        reporterId: session.user.id,
        reason: validation.data.reason,
        status: REPORT_STATUS.PENDING,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateReportStatusAction(
  reportId: string,
  status: "REVIEWING" | "RESOLVED" | "DISMISSED"
) {
  const session = await requireSession();

  if (session.user.role !== "ADMIN") {
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
        status: validation.data.status as "REVIEWING" | "RESOLVED" | "DISMISSED",
        resolvedBy: validation.data.status === REPORT_STATUS.RESOLVED || validation.data.status === REPORT_STATUS.DISMISSED 
          ? session.user.id 
          : null,
        resolvedAt: validation.data.status === REPORT_STATUS.RESOLVED || validation.data.status === REPORT_STATUS.DISMISSED 
          ? new Date() 
          : null,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getReports() {
  const session = await requireSession();

  if (session.user.role !== "ADMIN") {
    return [];
  }

  try {
    const reports = await prisma.report.findMany({
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    return reports;
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return [];
  }
}

