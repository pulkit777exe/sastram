"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertAdmin } from "@/modules/auth/session";
import { createCommunity } from "./repository";

// Helper to build slug (duplicated for now, should be in shared utils)
function buildSlug(title: string): string {
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")}-${crypto.randomUUID()}`;
}

const communitySchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal("")),
});

export async function createCommunityAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session.user);

  const parsed = communitySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid community data");
  }

  const slug = buildSlug(parsed.data.title);
  await createCommunity({
    title: parsed.data.title,
    description: parsed.data.description,
    slug,
    createdBy: session.user.id,
  });

  revalidatePath("/dashboard");
}
