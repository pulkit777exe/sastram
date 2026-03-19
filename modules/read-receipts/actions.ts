"use server";

import { requireSession } from "@/modules/auth/session";
import { markThreadReadSchema } from "@/modules/read-receipts/schemas";
import { upsertThreadReadReceipt } from "@/modules/read-receipts/repository";
import { logger } from "@/lib/infrastructure/logger";

export async function markThreadReadAction(
  threadId: string,
  lastReadMessageId?: string | null,
) {
  const validation = markThreadReadSchema.safeParse({
    threadId,
    lastReadMessageId: lastReadMessageId ?? null,
  });
  if (!validation.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    await upsertThreadReadReceipt({
      threadId: validation.data.threadId,
      userId: session.user.id,
      lastReadMessageId: validation.data.lastReadMessageId ?? null,
    });

    return { data: { marked: true }, error: null };
  } catch (error) {
    logger.error("[markThreadReadAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
