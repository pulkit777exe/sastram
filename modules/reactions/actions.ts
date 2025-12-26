"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import {
  addReaction,
  removeReaction,
  getMessageReactions,
} from "@/modules/reactions/repository";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { toggleReactionSchema, getReactionSummarySchema } from "./schemas";

export async function toggleReaction(messageId: string, emoji: string) {
  const session = await requireSession();

  const validation = validate(toggleReactionSchema, { messageId, emoji });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if user already reacted with this emoji
    const existing = await prisma.reaction.findFirst({
      where: {
        messageId,
        userId: session.user.id,
        emoji,
      },
    });

    if (existing) {
      // Remove reaction
      await removeReaction(messageId, session.user.id, emoji);
    } else {
      // Add reaction
      await addReaction(messageId, session.user.id, emoji);
    }

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getReactionSummary(messageId: string) {
  const validation = validate(getReactionSummarySchema, { messageId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const reactions = await getMessageReactions(messageId);
    return { success: true, data: reactions };
  } catch (error) {
    return handleError(error);
  }
}

