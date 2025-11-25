"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { buildThreadSlug } from "./service";
import { createThread, deleteThread, listThreads } from "./repository";



const threadSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(480).optional().or(z.literal("")),
  communityId: z.string().cuid().optional().or(z.literal("")),
});



export async function createThreadAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session.user);

  const parsed = threadSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    communityId: formData.get("communityId"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid thread data");
  }

  const slug = buildThreadSlug(parsed.data.title);
  await createThread({
    name: parsed.data.title,
    description: parsed.data.description,
    communityId: parsed.data.communityId || null,
    slug,
    createdBy: session.user.id,
  });

  revalidatePath("/dashboard");
}

export async function deleteThreadAction(threadId: string) {
  const session = await requireSession();
  assertAdmin(session.user);

  await deleteThread(threadId);
  revalidatePath("/dashboard");
}

export async function getDashboardThreads() {
  return listThreads();
}

