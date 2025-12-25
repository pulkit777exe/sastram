"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const inviteFriendSchema = z.object({
  threadId: z.string(),
  email: z.string().email("Invalid email address"),
  message: z.string().optional(),
});

export async function inviteFriendToThread(formData: FormData) {
  const threadId = formData.get("threadId") as string;
  const email = formData.get("email") as string;
  const message = formData.get("message") as string | null;

  const validation = inviteFriendSchema.safeParse({
    threadId,
    email,
    message: message || undefined,
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message || "Invalid invitation data",
    };
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
    console.error("Failed to send invitation:", error);
    return { error: "Failed to send invitation" };
  }
}

