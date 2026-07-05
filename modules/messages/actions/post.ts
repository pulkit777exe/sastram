'use server';

import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createMessageWithAttachmentsSchema } from '@/lib/schemas/database';
import { messageLimiter } from '@/lib/services/rate-limit';
import { parseMentions, resolveUserMentions } from '@/lib/utils/mention-parser';
import { ROUTES } from '@/lib/config/routes';
import { recordActivity } from '@/modules/activity';
import { infraMessageSideEffects } from '@/modules/messages/adapters/infra-side-effects';
import { moderateIncomingMessage } from './moderation-hooks';
import { createMentionsForMessage } from './mentions';
import { queueAiInlineIfRequested } from './ai-inline';
import { prismaErrorMessage } from '@/lib/utils/errors';
import { sanitizeUserContent } from '@/lib/services/content-safety';

export async function postMessage(formData: FormData) {
  const rawContent = formData.get('content') as string;
  const { sanitized: content } = sanitizeUserContent(rawContent);
  const threadId = formData.get('threadId') as string;
  const parentId = formData.get('parentId') as string | null;
  const mentionsRaw = formData.get('mentions') as string | null;
  const attachmentsRaw = formData.get('attachments') as string | null;

  let attachments: Array<{ url: string; type: string; name?: string; size?: number }> = [];
  if (attachmentsRaw) {
    try {
      const parsed = JSON.parse(attachmentsRaw);
      if (Array.isArray(parsed) && parsed.length <= 10) {
        attachments = parsed.filter(
          (a: { url?: string; type?: string }) => a.url && a.type
        );
      }
    } catch {
      // Ignore malformed attachments JSON
    }
  }

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
    threadId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return { data: null, error: 'Invalid input', errorCode: 'VALIDATION_ERROR', ok: false };
  }

  const session = await requireSession(false);

  // Ensure the user has a thread_members row (auto-enroll for public threads).
  // If the user is authenticated but lacks a membership record, create one.
  try {
    const existing = await prisma.threadMember.findUnique({
      where: { threadId_userId: { threadId, userId: session.user.id } },
    });

    if (!existing) {
      // Verify the thread exists before auto-enrolling
      const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { id: true, visibility: true },
      });

      if (!thread) {
        return { data: null, error: 'Thread not found', errorCode: 'NOT_FOUND', ok: false };
      }

      // Auto-enroll for PUBLIC or UNLISTED threads; PRIVATE requires explicit invite
      if (thread.visibility === 'PRIVATE') {
        return {
          data: null,
          error: 'You are not a member of this thread',
          errorCode: 'FORBIDDEN',
          ok: false,
        };
      }

      await prisma.threadMember.create({
        data: {
          threadId,
          userId: session.user.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });
    } else if (existing.status !== 'ACTIVE') {
      return {
        data: null,
        error: 'Your membership in this thread is inactive',
        errorCode: 'FORBIDDEN',
        ok: false,
      };
    }
  } catch (membershipError) {
    logger.error('[postMessage] membership check failed', membershipError);
    return { data: null, error: 'Failed to verify membership', errorCode: 'INTERNAL_ERROR', ok: false };
  }

  const rateLimitResult = await messageLimiter.check(session.user.id);
  if (!rateLimitResult.success) {
    return {
      data: null,
      error: 'Rate limit exceeded. Please slow down.',
      errorCode: 'RATE_LIMITED',
      ok: false,
    };
  }

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
      threadId,
      authorId: session.user.id,
      content,
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

    const message = moderationResult.message;

    if (!message) {
      return {
        data: null,
        error: 'Message not found after creation',
        errorCode: 'NOT_FOUND',
        ok: false,
      };
    }

    // Create attachment records if files were uploaded
    let createdAttachments: Array<{ id: string; url: string; type: string; name: string | null; size: number | null }> = [];
    if (attachments.length > 0) {
      try {
        const attachmentData = attachments.map((a) => ({
          messageId: message.id,
          url: a.url,
          type: a.type as 'IMAGE' | 'GIF' | 'FILE' | 'VIDEO',
          name: a.name ?? null,
          size: a.size ? BigInt(a.size) : null,
        }));
        await prisma.attachment.createMany({ data: attachmentData });
        const rawAttachments = await prisma.attachment.findMany({
          where: { messageId: message.id },
        });
        createdAttachments = rawAttachments.map((a) => ({
          ...a,
          size: a.size !== null ? Number(a.size) : null,
        }));
      } catch (attachmentError) {
        logger.error('[postMessage] failed to create attachments', attachmentError);
        // Message was already created — don't fail the whole request
      }
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

    const payload = {
      id: message.id,
      content: message.content,
      senderId: session.user.id,
      senderName: session.user.name || session.user.email,
      senderImage: session.user.image,
      createdAt: message.createdAt,
      threadId,
      parentId: message.parentId ?? null,
      depth: message.depth ?? 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: false,
      reactions: [],
      attachments: createdAttachments,
    };

    infraMessageSideEffects.emitThreadMessage(threadId, payload);

    const { aiInlineQueued, aiInlineLimited } = await queueAiInlineIfRequested({
      content,
      userId: session.user.id,
      threadId,
      messageId: message.id,
      sideEffects: infraMessageSideEffects,
    });

    if (message.thread?.slug) {
      revalidatePath(ROUTES.THREAD(message.thread.slug));
    }
    revalidatePath(ROUTES.DASHBOARD);

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
      },
      error: null,
      errorCode: null,
      ok: true,
    };
  } catch (error) {
    logger.error('[postMessage]', error);
    const prismaMsg = prismaErrorMessage(error);
    if (prismaMsg) return { data: null, error: prismaMsg, errorCode: null, ok: false };
    return { data: null, error: 'Something went wrong', errorCode: 'INTERNAL_ERROR', ok: false };
  }
}
