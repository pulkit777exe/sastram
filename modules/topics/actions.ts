"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { buildThreadSlug } from "@/modules/threads/service";
import { createTopicSchema } from "./schemas";

export async function createTopic(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const icon = (formData.get("icon") as string) || "Hash";

  const parsed = createTopicSchema.safeParse({ title, description, icon });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: "Something went wrong" };
    }

    await prisma.section.create({
      data: {
        name: parsed.data.title,
        description: parsed.data.description,
        createdBy: session.user.id,
        slug: buildThreadSlug(parsed.data.title),
      },
    });

    revalidatePath("/dashboard");
    return { data: null, error: null };
  } catch (error) {
    console.error("[createTopic]", error);
    return { data: null, error: "Something went wrong" };
  }
}
