"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const reportSchema = z.object({
  messageId: z.string().cuid(),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason must be less than 500 characters"),
});

export async function createReport(formData: FormData) {
  const messageId = formData.get("messageId") as string;
  const reason = formData.get("reason") as string;

  const validation = reportSchema.safeParse({ messageId, reason });
  
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

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
        status: "PENDING",
      },
    });

    revalidatePath("/dashboard/admin/reports");
    return { success: true };
  } catch (error) {
    console.error("Failed to create report:", error);
    return { error: "Failed to create report" };
  }
}

export async function updateReportStatusAction(
  reportId: string,
  status: "REVIEWING" | "RESOLVED" | "DISMISSED"
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        resolvedBy: status === "RESOLVED" || status === "DISMISSED" ? session.user.id : null,
        resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
      },
    });

    revalidatePath("/dashboard/admin/reports");
    return { success: true };
  } catch (error) {
    console.error("Failed to update report:", error);
    return { error: "Failed to update report" };
  }
}

export async function getReports() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== "ADMIN") {
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

