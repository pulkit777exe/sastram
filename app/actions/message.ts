"use server";

import { prisma } from "@/lib/prisma";
import { messageSchema } from "@/lib/security";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { containsBadLanguage, filterBadLanguage } from "@/lib/content-safety";

export async function postMessage(formData: FormData) {
  const content = formData.get("content") as string;
  const sectionId = formData.get("sectionId") as string;

  // Validate input
  const validation = messageSchema.safeParse({ content, sectionId });
  
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  // Content Safety Check
  if (containsBadLanguage(content)) {
    // Option 1: Reject
    // return { error: "Message contains inappropriate language." };
    
    // Option 2: Filter (User requested "Language filters ... before sending")
    // I will filter it but maybe warn the user? For now, just filter.
  }
  
  const safeContent = filterBadLanguage(content);

  // Get current user
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
      },
      include: {
        sender: {
          select: {
            name: true,
            image: true,
          },
        },
        attachments: true,
      },
    });

    // Handle attachment if present (Mock)
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

    revalidatePath(`/dashboard/topics/${sectionId}`);
    return { success: true, data: message };
  } catch (error) {
    console.error("Failed to post message:", error);
    return { error: "Failed to post message" };
  }
}
