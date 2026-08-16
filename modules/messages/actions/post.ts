'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeContent } from '@/lib/services/content-safety';
import { createMessageWithAttachmentsSchema } from '@/modules/messages/schemas';
import { getMessageLimiter } from '@/lib/services/rate-limit';
import { parseMentions, resolveUserMentions } from '@/lib/utils/mention-parser';
import { recordActivity } from '@/modules/activity';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import { moderateIncomingMessage } from './moderation-hooks';
import { createMentionsForMessage } from './mentions';
import { queueAiInlineIfRequested } from './ai-inline';
import { requireThreadWriteOrThrow } from '@/modules/threads/access';
import { createServerAction, type ActionResult } from '@/lib/utils/server-action';
import { actionSuccess, actionFailure } from '@/lib/actions/result';

const MAX_MENTIONS = 10;

// The composer posts FormData, so every field arrives as a string. Shape is
// validated here; the domain rules live in createMessageWithAttachmentsSchema.
const postMessageSchema = z.object({
  content: z.string(),
  threadId: z.string(),
  parentId: z.string().optional(),
  mentions: z.string().optional(),
  attachments: z.string().optional(),
  poll: z.string().optional(),
  clientStreams: z.enum(['0', '1']).optional(),
});

const messageInclude = {
  thread: { select: { id: true, name: true, slug: true } },
  sender: { select: { id: true, name: true, image: true } },
  attachments: true,
  poll: { include: { votes: true } },
} satisfies Prisma.MessageInclude;

type PostedMessage = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

interface PostMessageData {
  message: PostedMessage | null;
  pendingModeration: boolean | null;
  aiInlineQueued: boolean;
  aiInlineLimited: boolean;
  aiInlineStreaming: boolean;
}

function parseJsonField(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const blocked = (
  message: string,
  pendingModeration: boolean | null
): ActionResult<PostMessageData> => ({
  ...actionFailure<PostMessageData>('FORBIDDEN', message),
  data: {
    message: null,
    pendingModeration,
    aiInlineQueued: false,
    aiInlineLimited: false,
    aiInlineStreaming: false,
  },
});

export const postMessage = createServerAction(
  { schema: postMessageSchema, actionName: 'postMessage' },
  async (input): Promise<ActionResult<PostMessageData>> => {
    const { content, threadId, parentId, clientStreams } = input;

    // Mentions come from two sources: ids the composer resolved client-side, and
    // @handles parsed out of the raw text. Merge both, tolerating malformed JSON.
    let mentions = await resolveUserMentions(parseMentions(content).usernames, prisma);
    if (input.mentions) {
      try {
        mentions = Array.from(new Set([...(JSON.parse(input.mentions) as string[]), ...mentions]));
      } catch (error) {
        logger.debug('[postMessage] ignoring malformed mentions payload', error);
      }
    }

    const validation = createMessageWithAttachmentsSchema.safeParse({
      content,
      threadId,
      parentId: parentId || undefined,
      mentions,
      attachments: parseJsonField(input.attachments),
      poll: parseJsonField(input.poll),
    });

    if (!validation.success) {
      return actionFailure('VALIDATION_ERROR', 'Invalid input');
    }

    const session = await requireSession();
    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

    // Fail open: a Redis outage should degrade limiting, not block posting.
    let withinRateLimit = true;
    try {
      withinRateLimit = (await getMessageLimiter().check(session.user.id)).success;
    } catch (error) {
      logger.warn('[postMessage] rate limit check failed, allowing post', error);
    }

    if (!withinRateLimit) {
      return actionFailure('RATE_LIMITED', 'Rate limit exceeded. Please slow down.');
    }

    if (mentions.length > MAX_MENTIONS) {
      return actionFailure(
        'VALIDATION_ERROR',
        `A message can include at most ${MAX_MENTIONS} mentions.`
      );
    }

    const safeContent = sanitizeContent(content);

    try {
      const moderationResult = await moderateIncomingMessage({
        threadId,
        authorId: session.user.id,
        content: safeContent,
        parentId: parentId ?? null,
        attachments: validation.data.attachments,
        poll: validation.data.poll,
      });

      if (!moderationResult.success) {
        return blocked(
          moderationResult.reason || 'Message blocked by content filter',
          moderationResult.pendingModeration ?? null
        );
      }

      const message = await prisma.message.findUnique({
        where: { id: moderationResult.messageId! },
        include: messageInclude,
      });

      if (!message) {
        return actionFailure('NOT_FOUND', 'Message not found after creation');
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
        threadSlug: message.thread?.slug ?? null,
        sideEffects: infraMessageSideEffects,
      });

      const { aiInlineQueued, aiInlineLimited, aiInlineStreaming } = await queueAiInlineIfRequested({
        content: safeContent,
        userId: session.user.id,
        threadId,
        messageId: message.id,
        sideEffects: infraMessageSideEffects,
        clientStreams: clientStreams === '1',
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

      return actionSuccess({
        message,
        pendingModeration: moderationResult.pendingModeration ?? null,
        aiInlineQueued,
        aiInlineLimited,
        aiInlineStreaming,
      });
    } catch (error) {
      logger.error('[postMessage]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);
