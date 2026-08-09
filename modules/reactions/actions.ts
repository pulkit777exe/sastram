'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import {
  addReaction,
  removeReaction,
  getMessageReactions,
  getUserReaction,
} from '@/modules/reactions/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { requireThreadAccessOrThrow } from '@/lib/thread-access';

const toggleReactionSchema = z.object({
  messageId: z.string().cuid(),
  emoji: z.string().min(1),
});

const getReactionSummarySchema = z.object({
  messageId: z.string().cuid(),
});

// Reactions are authorized through the message's thread, so every action has to
// resolve the thread first.
async function authorizeMessage(messageId: string) {
  const session = await requireSession();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { threadId: true },
  });

  if (!message) return { session: null, notFound: true } as const;

  await requireThreadAccessOrThrow(message.threadId, session.user.id, session.user.role);
  return { session, notFound: false } as const;
}

const messageNotFound = {
  data: null,
  error: 'Message not found',
  errorCode: 'NOT_FOUND',
  ok: false,
} as const;

export const toggleReaction = createServerAction(
  { schema: toggleReactionSchema, actionName: 'toggleReaction' },
  async ({ messageId, emoji }) => {
    const { session, notFound } = await authorizeMessage(messageId);
    if (notFound) return messageNotFound;

    const existing = await getUserReaction(messageId, session.user.id, emoji);
    if (existing) {
      await removeReaction(messageId, session.user.id, emoji);
    } else {
      await addReaction(messageId, session.user.id, emoji);
    }

    revalidatePath('/dashboard/threads');
    return { data: null, error: null, ok: true, errorCode: null };
  }
);

export const getReactionSummary = createServerAction(
  { schema: getReactionSummarySchema, actionName: 'getReactionSummary' },
  async ({ messageId }) => {
    const { session, notFound } = await authorizeMessage(messageId);
    if (notFound) return messageNotFound;

    const reactions = await getMessageReactions(messageId, session.user.id);
    return { data: reactions, error: null, ok: true, errorCode: null };
  }
);
