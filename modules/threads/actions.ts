"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { buildThreadSlug } from "./service";
import {
  createThread,
  deleteThread,
  listThreads,
  getThreadMembers,
  updateThreadMemberRole,
  removeThreadMember,
} from "./repository";
import { prisma } from "@/lib/infrastructure/prisma";
import type { SectionRole } from "@prisma/client";

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

export async function getThreadMembersAction(threadId: string) {
  await requireSession();
  return getThreadMembers(threadId);
}

export async function manageThreadMemberAction(payload: {
  threadId: string;
  userId: string;
  action: "update_role" | "remove";
  role?: SectionRole;
}) {
  const session = await requireSession();

  const thread = await prisma.section.findUnique({
    where: { id: payload.threadId },
    select: { createdBy: true, slug: true },
  });

  if (!thread) {
    throw new Error("Thread not found");
  }

  const isCreator = thread.createdBy === session.user.id;

  // Allow Creator or Global Admin
  if (!isCreator) {
    try {
      assertAdmin(session.user);
    } catch {
      throw new Error(
        "Unauthorized: Only the thread creator can manage members",
      );
    }
  }

  if (payload.userId === session.user.id) {
    throw new Error("Cannot modify your own access");
  }

  if (payload.action === "update_role") {
    if (!payload.role) throw new Error("Role is required");
    await updateThreadMemberRole(
      payload.threadId,
      payload.userId,
      payload.role,
    );
  } else if (payload.action === "remove") {
    await removeThreadMember(payload.threadId, payload.userId);
  }

  revalidatePath(`/dashboard/threads/thread/${thread.slug}`);
}
