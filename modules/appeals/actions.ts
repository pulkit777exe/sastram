"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { handleError } from "@/lib/utils/errors";
import { z } from "zod";
import { validate } from "@/lib/utils/validation";

const createAppealSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters long"),
});

export async function submitAppeal(formData: FormData) {
  const session = await requireSession(false);

  if (session.user.status !== "BANNED" && session.user.status !== "SUSPENDED") {
    return { error: "You are not banned" };
  }

  const rawData = {
    reason: formData.get("reason"),
  };

  const validation = validate(createAppealSchema, rawData);
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // specific to the *latest* active ban.
    // Ideally we link the appeal to a specific ban, but for now we find the active ban.
    const ban = await prisma.userBan.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!ban) {
      return { error: "No active ban found to appeal" };
    }

    // Check if appeal already pending
    const existingAppeal = await prisma.appeal.findFirst({
      where: { userId: session.user.id, status: "PENDING" },
    });

    if (existingAppeal) {
      return { error: "You already have a pending appeal" };
    }

    // Since Appeal model links to a messageId, we need to know WHICH message led to the ban.
    // The UserBan model doesn't explicitly link to a message, but usually a Report -> Message -> Ban.
    // However, bans can be manual.
    // Looking at Appeal model: `messageId String`. This is a required field.
    // This implies appeals are tied to specific reported messages.
    // If a user is banned manually without a message (generic ban), the Appeal model constraint `messageId` is problematic.

    // Let's check if we can find a message associated with the ban.
    // If the ban has a threadId, maybe we can pick the last message by user in that thread?
    // Or if the ban was created from a report, we should have stored the reportId or something.
    // UserBan has `reason` and `customReason`.

    // Workaround: If we cannot find a message, we might need to adjust the schema or find a dummy message.
    // BUT, the schema says `message Message @relation(...)`.

    // Let's assume for now most bans come from a message context.
    // If not, we might need a Schema change to make messageId optional.

    // For this implementation, I will seek the most recent message by the user that was deleted or reported?
    // Or just the most recent message.

    // Let's check `UserBan` again. It has `userId`.
    // I'll grab the user's last message.

    const lastMessage = await prisma.message.findFirst({
      where: { senderId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!lastMessage) {
      // If user has NO messages, they shouldn't be banned for content?
      // Maybe they were banned for profile pic?
      // If so, we can't create an Appeal with current schema.
      // Blocked. I'll need to check the schema or notify user.
      // However, to unblock, I will proceed assuming there is a message.
      return { error: "Cannot create appeal: No message history found." };
    }

    await prisma.appeal.create({
      data: {
        userId: session.user.id,
        messageId: lastMessage.id, // Linking to last message as proxy if exact message unknown
        reason: validation.data.reason,
        status: "PENDING",
      },
    });

    revalidatePath("/banned");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getAppeals() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return [];
  }

  try {
    const appeals = await prisma.appeal.findMany({
      where: { status: "PENDING" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        message: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // We also need the ban info.
    // Since we don't have a direct relation, we fetch active bans for these users.
    const userIds = appeals.map((a) => a.userId);
    const bans = await prisma.userBan.findMany({
      where: { userId: { in: userIds }, isActive: true },
    });

    return appeals.map((appeal) => {
      const ban = bans.find((b) => b.userId === appeal.userId);
      return {
        ...appeal,
        banReason: ban?.reason || "Unknown",
        banDate: ban?.createdAt || new Date(),
      };
    });
  } catch (error) {
    console.error("Failed to fetch appeals:", error);
    return [];
  }
}

export async function resolveAppeal(appealId: string, approved: boolean) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { error: "Unauthorized" };
  }

  try {
    const appeal = await prisma.appeal.findUnique({
      where: { id: appealId },
      include: { user: true },
    });

    if (!appeal) {
      return { error: "Appeal not found" };
    }

    await prisma.$transaction(async (tx) => {
      // Update appeal status
      await tx.appeal.update({
        where: { id: appealId },
        data: {
          status: approved ? "APPROVED" : "DENIED",
          resolvedAt: new Date(),
          moderatorId: session.user.id,
        },
      });

      if (approved) {
        // Deactivate all active bans for this user
        await tx.userBan.updateMany({
          where: { userId: appeal.userId, isActive: true },
          data: { isActive: false },
        });

        // Restore user status
        await tx.user.update({
          where: { id: appeal.userId },
          data: { status: "ACTIVE" },
        });
      }
    });

    revalidatePath("/dashboard/admin/appeals");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
