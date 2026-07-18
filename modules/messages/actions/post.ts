'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { logger } from '@/lib/infrastructure/logger';
import { filterBadLanguage } from '@/lib/services/content-safety';
import { createMessageWithAttachmentsSchema } from '@/modules/messages/schemas';
import { messageLimiter } from '@/lib/services/rate-limit';
import { parseMentions, resolveUserMentions } from '@/lib/utils/mention-parser';
import { recordActivity } from '@/modules/activity';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import { moderateIncomingMessage } from './moderation-hooks';
import { createMentionsForMessage } from './mentions';
import { queueAiInlineIfRequested } from './ai-inline';
import { requireThreadWriteOrThrow } from '@/lib/thread-access';

export async function postMessage(formData: FormData) {
  const content = formData.get('content') as string;
  const threadId = formData.get('threadId') as string;
  const parentId = formData.get('parentId') as string | null;
  const mentionsRaw = formData.get('mentions') as string | null;

  const parsedMentions = parseMentions(content);
  let mentions: string[];

  if (mentionsRaw) {
    try {
      const explicitMentions = JSON.parse(mentionsRaw) as string[];
      const resolvedMentions = await resolveUserMentions(parsedMentions.usernames, prisma);
      mentions = Array.from(new Set([...explicitMentions, ...resolvedMentions]));
    } catch {
      mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
    }
  } else {
    mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    threadId: threadId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return { data: null, error: 'Invalid input', errorCode: 'VALIDATION_ERROR', ok: false };
  }

  const session = await requireSession();
  await requireThreadWriteOrThrow(threadId, session.user.id, session.user.role);

  try {
    const rateLimitResult = await messageLimiter.check(session.user.id);
    if (!rateLimitResult.success) {
      return {
        data: null,
        error: 'Rate limit exceeded. Please slow down.',
        errorCode: 'RATE_LIMITED',
        ok: false,
      };
    }
  } catch {
    return {
      data: null,
      error: 'Rate limit exceeded. Please slow down.',
      errorCode: 'RATE_LIMITED',
      ok: false,
    };
  }

  const safeContent = filterBadLanguage(content);

  if (mentions.length > 10) {
    return {
      data: null,
      error: 'A message can include at most 10 mentions.',
      errorCode: 'VALIDATION_ERROR',
      ok: false,
    };
  }

  try {
    const moderationResult = await moderateIncomingMessage({
      threadId: threadId,
      authorId: session.user.id,
      content: safeContent,
      parentId,
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
        thread: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        attachments: true,
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
      threadId: threadId,
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

    const payload = {
      id: message.id,
      content: message.content,
      senderId: session.user.id,
      senderName: message.sender?.name || session.user.email,
      senderImage: message.sender?.image ?? session.user.image,
      createdAt: message.createdAt,
      threadId: threadId,
      parentId: message.parentId ?? null,
      depth: message.depth ?? 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: false,
      reactions: [],
      attachments: message.attachments.map((att) => ({
        id: att.id,
        url: att.url,
        type: att.type,
        name: att.name,
        size: att.size !== null ? Number(att.size) : null,
      })),
    };

    infraMessageSideEffects.emitThreadMessage(threadId, payload);

    const { aiInlineQueued, aiInlineLimited } = await queueAiInlineIfRequested({
      content: safeContent,
      userId: session.user.id,
      threadId: threadId,
      messageId: message.id,
      sideEffects: infraMessageSideEffects,
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
        threadId: threadId,
        threadName: message.thread?.slug,
      },
    });

    return {
      data: {
        message,
        pendingModeration: moderationResult.pendingModeration,
        aiInlineQueued,
        aiInlineLimited,
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
