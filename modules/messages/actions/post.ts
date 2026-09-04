'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { logger } from '@/lib/infrastructure/logger';
import { sanitizeContent } from '@/lib/services/content-safety';
import { createMessageWithAttachmentsSchema } from '@/modules/messages/schemas';
import { getMessageLimiter } from '@/lib/services/rate-limit';
import { parseMentions, resolveUserMentions } from '@/modules/messages/mention-parser';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import { moderateIncomingMessage } from './moderation-hooks';
import { createMentionsForMessage } from './mentions';
import { queueAiInlineIfRequested } from './ai-inline';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';
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
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseMentionsJson(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch (error) {
    logger.debug('[postMessage] ignoring malformed mentions payload', error);
    return [];
  }
}

function mergeMentions(baseMentions: string[], extraJson: string | undefined): string[] {
  const extraIds = parseMentionsJson(extraJson);
  if (extraIds.length === 0) return baseMentions;
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...extraIds, ...baseMentions]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

async function gatherMentionIds(content: string, mentionsJson: string | undefined): Promise<string[]> {
  const parsedHandles = parseMentions(content).usernames;
  const resolvedHandles = await resolveUserMentions(parsedHandles, prisma);
  return mergeMentions(resolvedHandles, mentionsJson);
}

function buildBlockedResult(
  message: string,
  pendingModeration: boolean | null
): ActionResult<PostMessageData> {
  return {
    data: {
      message: null,
      pendingModeration,
      aiInlineQueued: false,
      aiInlineLimited: false,
      aiInlineStreaming: false,
    },
    error: message,
    errorCode: 'FORBIDDEN',
    ok: false,
  };
}

async function checkRateLimit(userId: string): Promise<boolean> {
  try {
    const result = await getMessageLimiter().check(userId);
    return result.success;
  } catch (error) {
    logger.warn('[postMessage] rate limit check failed, allowing post', error);
    return true;
  }
}

async function persistModeratedMessage(args: {
  threadId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  attachments?: { name?: string | null; url: string; type: string; size?: number | null }[];
  poll?: { question: string; options: string[]; expiresAt?: string | Date | null } | null;
}) {
  return moderateIncomingMessage(args);
}

async function finalizePostSuccess(args: {
  messageId: string;
  threadId: string;
  mentions: string[];
  safeContent: string;
  session: { user: { id: string; name: string | null; email: string } };
  clientStreams?: string;
  moderationResult: { pendingModeration?: boolean | null };
}): Promise<ActionResult<PostMessageData>> {
  const message = await prisma.message.findUnique({
    where: { id: args.messageId },
    include: messageInclude,
  });
  if (!message) return actionFailure('NOT_FOUND', 'Message not found after creation');

  await createMentionsForMessage({
    messageId: message.id,
    threadId: args.threadId,
    mentions: args.mentions,
    mentionedBy: { id: args.session.user.id, name: args.session.user.name, email: args.session.user.email },
    content: message.content,
    threadSlug: message.thread?.slug ?? null,
    sideEffects: infraMessageSideEffects,
  });

  const aiResult = await queueAiInlineIfRequested({
    content: args.safeContent,
    userId: args.session.user.id,
    threadId: args.threadId,
    messageId: message.id,
    sideEffects: infraMessageSideEffects,
    clientStreams: args.clientStreams === '1',
  });

  infraMessageSideEffects.revalidateThreadPage(message.thread?.slug ?? null);
  infraMessageSideEffects.revalidateDashboard();
  await infraMessageSideEffects.recordActivity({
    userId: args.session.user.id,
    type: 'MESSAGE_POSTED',
    entityType: 'Message',
    entityId: message.id,
    metadata: { threadId: args.threadId, threadName: message.thread?.slug },
  });

  return actionSuccess({
    message,
    pendingModeration: args.moderationResult.pendingModeration ?? null,
    aiInlineQueued: aiResult.aiInlineQueued,
    aiInlineLimited: aiResult.aiInlineLimited,
    aiInlineStreaming: aiResult.aiInlineStreaming,
  });
}

export const postMessage = createServerAction(
  { schema: postMessageSchema, actionName: 'postMessage' },
  async (input): Promise<ActionResult<PostMessageData>> => {
    const { content, threadId, parentId, clientStreams } = input;
    const mentions = await gatherMentionIds(content, input.mentions);
    const parentIdValue = parentId ?? undefined;

    const validation = createMessageWithAttachmentsSchema.safeParse({
      content,
      threadId,
      parentId: parentIdValue,
      mentions,
      attachments: parseJsonField(input.attachments),
      poll: parseJsonField(input.poll),
    });
    if (!validation.success) return actionFailure('VALIDATION_ERROR', 'Invalid input');

    const session = await requireSession();
    await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

    const withinRateLimit = await checkRateLimit(session.user.id);
    if (!withinRateLimit) return actionFailure('RATE_LIMITED', 'Rate limit exceeded. Please slow down.');
    if (mentions.length > MAX_MENTIONS) {
      return actionFailure('VALIDATION_ERROR', `A message can include at most ${MAX_MENTIONS} mentions.`);
    }

    const safeContent = sanitizeContent(content);

    try {
      const moderationResult = await persistModeratedMessage({
        threadId,
        authorId: session.user.id,
        content: safeContent,
        parentId: parentId ?? null,
        attachments: validation.data.attachments as { name?: string | null; url: string; type: string; size?: number | null }[] | undefined,
        poll: validation.data.poll as { question: string; options: string[]; expiresAt?: string | Date | null } | null | undefined,
      });
      if (!moderationResult.success) {
        const reason = moderationResult.reason ?? 'Message blocked by content filter';
        const pending = moderationResult.pendingModeration ?? null;
        return buildBlockedResult(reason, pending);
      }
      return finalizePostSuccess({
        messageId: moderationResult.messageId!,
        threadId,
        mentions,
        safeContent,
        session,
        clientStreams,
        moderationResult,
      });
    } catch (error) {
      logger.error('[postMessage]', error);
      return actionFailure('INTERNAL_ERROR', 'Something went wrong');
    }
  }
);
