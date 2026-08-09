'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeContent } from '@/lib/services/content-safety';
import { createMessageWithAttachmentsSchema } from '@/modules/messages/schemas';
import { messageLimiter } from '@/lib/services/rate-limit';
import { parseMentions, resolveUserMentions } from '@/lib/utils/mention-parser';
import { recordActivity } from '@/modules/activity';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import { moderateIncomingMessage } from './moderation-hooks';
import { createMentionsForMessage } from './mentions';
import { queueAiInlineIfRequested } from './ai-inline';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';

const MAX_MENTIONS = 10;

function parseJsonField(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function postMessage(formData: FormData) {
  const content = formData.get('content') as string;
  const threadId = formData.get('threadId') as string;
  const parentId = formData.get('parentId') as string | null;
  const mentionsRaw = formData.get('mentions') as string | null;

  // Mentions come from two sources: ids the composer resolved client-side, and
  // @handles parsed out of the raw text. Merge both, tolerating malformed JSON.
  let mentions = await resolveUserMentions(parseMentions(content).usernames, prisma);
  if (mentionsRaw) {
    try {
      mentions = Array.from(new Set([...(JSON.parse(mentionsRaw) as string[]), ...mentions]));
    } catch {}
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    threadId,
    parentId: parentId || undefined,
    mentions,
    attachments: parseJsonField(formData.get('attachments') as string | null),
    poll: parseJsonField(formData.get('poll') as string | null),
  });

  if (!validation.success) {
    return { data: null, error: 'Invalid input', errorCode: 'VALIDATION_ERROR', ok: false };
  }

  const session = await requireSession();
  await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

  let withinRateLimit = false;
  try {
    withinRateLimit = (await messageLimiter.check(session.user.id)).success;
  } catch {}

  if (!withinRateLimit) {
    return {
      data: null,
      error: 'Rate limit exceeded. Please slow down.',
      errorCode: 'RATE_LIMITED',
      ok: false,
    };
  }

  if (mentions.length > MAX_MENTIONS) {
    return {
      data: null,
      error: `A message can include at most ${MAX_MENTIONS} mentions.`,
      errorCode: 'VALIDATION_ERROR',
      ok: false,
    };
  }

  const safeContent = sanitizeContent(content);

  try {
    const moderationResult = await moderateIncomingMessage({
      threadId,
      authorId: session.user.id,
      content: safeContent,
      parentId,
      attachments: validation.data.attachments,
      poll: validation.data.poll,
    });

    if (!moderationResult.success) {
      return {
        data: { pendingModeration: moderationResult.pendingModeration ?? null },
        error: moderationResult.reason || 'Message blocked by content filter',
        errorCode: 'FORBIDDEN',
        ok: false,
      };
    }

    const message = await prisma.message.findUnique({
      where: { id: moderationResult.messageId! },
      include: {
        thread: { select: { id: true, name: true, slug: true } },
        sender: { select: { id: true, name: true, image: true } },
        attachments: true,
        poll: { include: { votes: true } },
      },
    });

    if (!message) {
      return {
        data: null,
        error: 'Message not found after creation',
        errorCode: 'NOT_FOUND',
        ok: false,
      };
    }

    await createMentionsForMessage({
      messageId: message.id,
      threadId,
      mentions,
      mentionedBy: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      content: message.content,
      parentId: message.parentId ?? null,
      threadSlug: message.thread?.slug ?? null,
      sideEffects: infraMessageSideEffects,
    });

    const { aiInlineQueued, aiInlineLimited, aiInlineStreaming } = await queueAiInlineIfRequested({
      content: safeContent,
      userId: session.user.id,
      threadId,
      messageId: message.id,
      sideEffects: infraMessageSideEffects,
      clientStreams: formData.get('clientStreams') === '1',
    });

    if (message.thread?.slug) {
      revalidatePath(`/dashboard/threads/${message.thread.slug}`);
    }
    revalidatePath('/dashboard');

    await recordActivity({
      userId: session.user.id,
      type: 'MESSAGE_POSTED',
      entityType: 'Message',
      entityId: message.id,
      metadata: {
        threadId,
        threadName: message.thread?.slug,
      },
    });

    return {
      data: {
        message,
        pendingModeration: moderationResult.pendingModeration,
        aiInlineQueued,
        aiInlineLimited,
        aiInlineStreaming,
      },
      error: null,
      errorCode: null,
      ok: true,
    };
  } catch (error) {
    logger.error('[postMessage]', error);
    return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
  }
}
