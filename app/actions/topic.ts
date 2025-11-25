"use server";

import { prisma } from "@/lib/prisma";
import { topicSchema } from "@/lib/security";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { buildThreadSlug } from "@/modules/threads/service";

export async function createTopic(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const icon = formData.get("icon") as string || "Hash";

  // Validate input
  const validation = topicSchema.safeParse({ title, content: description }); // Reusing topicSchema which has title and content. Mapping description to content for validation.
  
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  // Get current user
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.section.create({
      data: {
        name: title,
        description: description,
        icon: icon,
        createdBy: session.user.id,
        slug: buildThreadSlug(title),
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to create topic:", error);
    return { error: "Failed to create topic" };
  }
}
