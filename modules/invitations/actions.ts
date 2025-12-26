"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { inviteFriendSchema } from "./schemas";

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get("threadId") as string;
  const email = formData.get("email") as string;
  const message = formData.get("message") as string | null;

  const validation = validate(inviteFriendSchema, {
    threadId,
    email,
    message: message || undefined,
  });

  if (!validation.success) {
    return { error: validation.error };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if thread exists
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      select: { id: true, slug: true, name: true },
    });

    if (!thread) {
      return { error: "Thread not found" };
    }

    // Check if invitation already exists
    const existingInvitation = await prisma.threadInvitation.findUnique({
      where: {
        threadId_email_senderId: {
          threadId,
          email,
          senderId: session.user.id,
        },
      },
    });

    if (existingInvitation) {
      return { error: "You have already invited this friend to this thread" };
    }

    // Create invitation
    const invitation = await prisma.threadInvitation.create({
      data: {
        threadId,
        senderId: session.user.id,
        email,
        message: message || null,
        status: "PENDING",
      },
      include: {
        thread: {
          select: {
            slug: true,
            name: true,
          },
        },
        sender: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // TODO: Send email notification here
    // For now, we'll just mark it as SENT
    await prisma.threadInvitation.update({
      where: { id: invitation.id },
      data: { status: "SENT" },
    });

    revalidatePath(`/dashboard/threads/thread/${thread.slug}`);
    return { success: true, data: invitation };
  } catch (error) {
    return handleError(error);
  }
}

