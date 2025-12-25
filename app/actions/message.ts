"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { containsBadLanguage, filterBadLanguage } from "@/lib/content-safety";
import { emitThreadMessage } from "@/modules/ws/publisher";
import { createMessageWithAttachmentsSchema } from "@/lib/schemas/database";

export async function postMessage(formData: FormData) {
  const content = formData.get("content") as string;
  const sectionId = formData.get("sectionId") as string;
  const parentId = formData.get("parentId") as string | null;
  const mentionsRaw = formData.get("mentions") as string | null;

  let mentions: string[] | undefined;
  if (mentionsRaw) {
    try {
      mentions = JSON.parse(mentionsRaw);
    } catch {
      return { error: "Invalid mentions format" };
    }
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    sectionId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message || "Invalid message data",
    };
  }

  if (containsBadLanguage(content)) {
    // Option 1: Reject
    // return { error: "Message contains inappropriate language." };
    // Option 2: Filter (User requested "Language filters ... before sending")
    // I will filter it but maybe warn the user? For now, just filter.
  }

  const safeContent = filterBadLanguage(content);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const message = await prisma.message.create({
      data: {
        content: safeContent,
        sectionId: sectionId,
        senderId: session.user.id,
        parentId: parentId || null,
      },
      include: {
        section: {
          select: {
            slug: true,
          },
        },
        sender: {
          select: {
            name: true,
            image: true,
          },
        },
        attachments: true,
      },
    });

    const fileName = formData.get("fileName") as string;
    if (fileName) {
      await prisma.attachment.create({
        data: {
          messageId: message.id,
          url: `https://example.com/files/${fileName}`,
          type: "FILE",
          name: fileName,
          size: parseInt(formData.get("fileSize") as string) || 0,
        },
      });
    }

    const payload = {
      id: message.id,
      content: message.content,
      senderId: session.user.id,
      senderName: message.sender?.name || session.user.email,
      senderAvatar: message.sender?.image ?? session.user.image,
      createdAt: message.createdAt,
      sectionId,
    };

    emitThreadMessage(sectionId, {
      type: "NEW_MESSAGE",
      payload,
    });

    if (message.section?.slug) {
      revalidatePath(`/dashboard/threads/thread/${message.section.slug}`);
    }
    revalidatePath("/dashboard");
    return { success: true, data: message };
  } catch (error) {
    console.error("Failed to post message:", error);
    return { error: "Failed to post message" };
  }
}
