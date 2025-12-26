"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { topicSchema } from "@/lib/utils/security";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { buildThreadSlug } from "@/modules/threads/service";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { createTopicSchema } from "./schemas";

export async function createTopic(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const icon = formData.get("icon") as string || "Hash";

  // Use topicSchema for validation (maps description to content)
  const validation = topicSchema.safeParse({ title, content: description });
  
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message };
  }

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
    return handleError(error);
  }
}

