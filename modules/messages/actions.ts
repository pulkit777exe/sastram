'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { requireSession } from '@/modules/auth/session';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { filterBadLanguage } from '@/lib/services/content-safety';
import {
  emitThreadMessage,
  emitMentionNotification,
  emitMessageDeleted,
  emitPinUpdate,
} from '@/modules/ws/publisher';
import { createMessageWithAttachmentsSchema } from '@/lib/schemas/database';
import { messageLimiter } from '@/lib/services/rate-limit';
import { MessageService } from '@/lib/services/moderation';
import { getMemberRole } from '@/modules/members/repository';
import { logAction } from '@/modules/audit/repository';
import {
  editMessageSchema,
  pinMessageSchema,
  deleteMessageSchema,
  getMessageEditHistorySchema,
  searchMentionUsersSchema,
} from './schemas';

import { parseMentions, resolveUserMentions } from '@/lib/utils/mention-parser';
import { sendMentionNotification } from '@/lib/services/email';
import { recordActivity } from '@/modules/activity/repository';
import { consumeAiInlineQuota } from '@/lib/services/ai-inline-rate-limit';
import { getAiInlineQueue } from '@/lib/infrastructure/bullmq';

function handleActionError(actionName: string, error: unknown) {
  logger.error(`[${actionName}]`, error);
  return { data: null, error: 'Something went wrong' };
}

function extractAiInlineQuery(content: string): string | null {
  const match = content.match(/(?:^|\s)@ai\s+(.+)/i);
  if (!match || !match[1]) {
    return null;
  }

  const query = match[1].trim();
  return query.length > 0 ? query : null;
}

export async function postMessage(formData: FormData) {
  const content = formData.get('content') as string;
  const sectionId = formData.get('sectionId') as string;
  const parentId = formData.get('parentId') as string | null;
  const mentionsRaw = formData.get('mentions') as string | null;

  // Parse mentions from content and combine with explicit mentions
  const parsedMentions = parseMentions(content);
  let mentions: string[] | undefined;

  if (mentionsRaw) {
    try {
      const explicitMentions = JSON.parse(mentionsRaw) as string[];
      // Resolve usernames from parsed mentions to user IDs
      const resolvedMentions = await resolveUserMentions(parsedMentions.usernames, prisma);
      // Combine explicit mentions (already user IDs) with resolved mentions
      mentions = Array.from(new Set([...explicitMentions, ...resolvedMentions]));
    } catch {
      // If explicit mentions fail, try to resolve parsed mentions
      mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
    }
  } else {
    // Only parse mentions from content
    mentions = await resolveUserMentions(parsedMentions.usernames, prisma);
  }

  const validation = createMessageWithAttachmentsSchema.safeParse({
    content,
    sectionId,
    parentId: parentId || undefined,
    mentions,
  });

  if (!validation.success) {
    return {
      data: null,
      error: 'Invalid input',
    };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: 'Something went wrong' };
  }

  // Rate limiting
  try {
    await messageLimiter.check(session.user.id);
  } catch {
    return { data: null, error: 'Rate limit exceeded. Please slow down.' };
  }

  // Content filtering
  const safeContent = filterBadLanguage(content);

  if ((mentions ?? []).length > 10) {
    return {
      data: null,
      error: 'A message can include at most 10 mentions.',
    };
  }

  try {
    const messageService = new MessageService();

    const recentMessages = await prisma.message.findMany({
      where: { sectionId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
      },
    });

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        name: true,
        visibility: true,
        createdBy: true,
      },
    });

    const context = {
      sectionId,
      participantIds: [session.user.id],
      recentHistory: recentMessages,
      sectionMetadata: {
        visibility: section?.visibility,
        name: section?.name,
        createdBy: section?.createdBy,
      },
      relationships: new Map(),
    };

    const result = await messageService.processMessage(
      {
        id: '',
        content: safeContent,
        authorId: session.user.id,
        sectionId,
        parentId,
        timestamp: new Date(),
        metadata: { edited: false },
      },
      context
    );

    if (!result.success) {
      return {
        data: { pendingModeration: result.pendingModeration ?? null },
        error: result.reason || 'Message blocked by content filter',
      };
    }

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: result.messageId! },
      include: {
        section: {
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

    // Create mentions
    if (mentions && mentions.length > 0) {
      await prisma.messageMention.createMany({
        data: mentions.map((userId) => ({
          messageId: message.id,
          userId,
        })),
      });

      // Create notifications for mentions (emails sent outside transaction)
      for (const userId of mentions) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'MENTION',
            title: 'You were mentioned',
            message: `${session.user.name || session.user.email} mentioned you in a message`,
            data: {
              messageId: message.id,
              sectionId,
              linkUrl: message.section?.slug
                ? `/dashboard/threads/thread/${message.section.slug}?focus=${message.id}`
                : null,
            },
          },
        });

        emitMentionNotification(sectionId, {
          messageId: message.id,
          mentionedUserId: userId,
          mentionedBy: session.user.id,
          mentionedByName: session.user.name || session.user.email,
          sectionId,
          content: message.content,
          parentId: message.parentId ?? undefined,
        });
      }
    }

    // Send email notifications for mentions (outside transaction)
    if (mentions && mentions.length > 0) {
      const thread = await prisma.section.findUnique({
        where: { id: sectionId },
        select: { name: true, slug: true },
      });

      if (thread) {
        const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/thread/${thread.slug}`;

        for (const userId of mentions) {
          const mentionedUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
          });

          if (mentionedUser) {
            sendMentionNotification(
              mentionedUser.email,
              session.user.name || session.user.email,
              thread.name,
              safeContent.substring(0, 200),
              threadUrl
            ).catch((error) => {
              logger.error('Failed to send mention email:', error);
            });
          }
        }
      }
    }

    // Emit WebSocket event (outside transaction)
    const payload = {
      id: message.id,
      content: message.content,
      senderId: session.user.id,
      senderName: message.sender?.name || session.user.email,
      senderAvatar: message.sender?.image ?? session.user.image,
      createdAt: message.createdAt,
      sectionId,
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

    emitThreadMessage(sectionId, payload);

    const aiQuery = extractAiInlineQuery(safeContent);
    let aiInlineQueued = false;
    let aiInlineLimited = false;
    if (aiQuery) {
      const quota = await consumeAiInlineQuota({
        userId: session.user.id,
        threadId: sectionId,
      });

      if (!quota.allowed) {
        aiInlineLimited = true;
      } else {
        await getAiInlineQueue().add('ai-inline-process', {
          messageId: message.id,
          threadId: sectionId,
          sectionId,
          query: aiQuery,
          userId: session.user.id,
        });
        aiInlineQueued = true;
      }
    }

    if (message.section?.slug) {
      revalidatePath(`/dashboard/threads/thread/${message.section.slug}`);
    }
    revalidatePath('/dashboard');

    // Record activity for message posted
    await recordActivity({
      userId: session.user.id,
      type: 'MESSAGE_POSTED',
      entityType: 'Message',
      entityId: message.id,
      metadata: {
        sectionId,
        threadName: message.section?.slug,
      },
    });

    return {
      data: {
        message,
        pendingModeration: result.pendingModeration,
        aiInlineQueued,
        aiInlineLimited,
      },
      error: null,
    };
  } catch (error) {
    return handleActionError('postMessage', error);
  }
}

export async function editMessage(messageId: string, content: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: 'Something went wrong' };
  }

  const validation = editMessageSchema.safeParse({ messageId, content });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    // Check if user owns the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, content: true, sectionId: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    if (message.senderId !== session.user.id) {
      return { data: null, error: 'You can only edit your own messages' };
    }

    // Save edit history
    await prisma.messageEdit.create({
      data: {
        messageId,
        content: message.content,
      },
    });

    // Update message
    const safeContent = filterBadLanguage(content);
    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: safeContent,
        isEdited: true,
      },
    });

    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  } catch (error) {
    return handleActionError('editMessage', error);
  }
}

export async function pinMessage(messageId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: null, error: 'Something went wrong' };
  }

  const validation = pinMessageSchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        isPinned: true,
        sectionId: true,
        section: {
          select: { slug: true },
        },
      },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    // Check if user has permission (moderator or owner)
    const memberRole = await getMemberRole(message.sectionId, session.user.id);

    if (!memberRole || !['OWNER', 'MODERATOR'].includes(memberRole.role)) {
      return {
        data: null,
        error: 'Insufficient permissions. Only moderators and owners can pin messages.',
      };
    }

    const shouldPin = !message.isPinned;

    const previouslyPinned = shouldPin
      ? await prisma.message.findFirst({
          where: {
            sectionId: message.sectionId,
            isPinned: true,
            id: { not: messageId },
          },
          select: { id: true },
        })
      : null;

    await prisma.$transaction(async (tx) => {
      if (shouldPin) {
        await tx.message.updateMany({
          where: { sectionId: message.sectionId, isPinned: true },
          data: { isPinned: false },
        });
      }

      await tx.message.update({
        where: { id: messageId },
        data: { isPinned: shouldPin },
      });
    });

    await logAction({
      action: message.isPinned ? 'MESSAGE_UPDATED' : 'MESSAGE_UPDATED',
      entityType: 'Message',
      entityId: messageId,
      userId: session.user.id,
    });

    emitPinUpdate(message.sectionId, { messageId, isPinned: shouldPin });

    if (previouslyPinned?.id) {
      emitPinUpdate(message.sectionId, {
        messageId: previouslyPinned.id,
        isPinned: false,
      });
    }

    revalidatePath(`/dashboard/threads/thread/${message.section?.slug}`);
    return { data: null, error: null };
  } catch (error) {
    return handleActionError('pinMessage', error);
  }
}

export async function getMessageEditHistory(messageId: string) {
  const validation = getMessageEditHistorySchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const edits = await prisma.messageEdit.findMany({
      where: { messageId: validation.data.messageId },
      orderBy: {
        editedAt: 'desc',
      },
    });

    return { data: edits ?? [], error: null };
  } catch (error) {
    return handleActionError('getMessageEditHistory', error);
  }
}

export async function deleteMessage(messageId: string) {
  const validation = deleteMessageSchema.safeParse({ messageId });
  if (!validation.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    // Check ownership or moderator role
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { section: true },
    });

    if (!message) {
      return { data: null, error: 'Message not found' };
    }

    let canDelete = message.senderId === session.user.id;
    if (!canDelete) {
      if (message.sectionId) {
        const memberRole = await getMemberRole(message.sectionId, session.user.id);
        if (memberRole && ['OWNER', 'MODERATOR'].includes(memberRole.role)) {
          canDelete = true;
        }
      }
    }

    if (!canDelete) {
      return { data: null, error: 'Insufficient permissions to delete this message' };
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    await logAction({
      action: 'MESSAGE_DELETED',
      entityType: 'Message',
      entityId: messageId,
      userId: session.user.id,
    });

    if (message.section?.slug) {
      revalidatePath(`/dashboard/threads/thread/${message.section.slug}`);
    }

    // Also emit websocket event for live updates
    try {
      if (message.sectionId) {
        emitMessageDeleted(message.sectionId, messageId, session.user.id);
      }
    } catch (e) {
      /* ignore ws errors */
    }

    return { data: null, error: null };
  } catch (error) {
    return handleActionError('deleteMessage', error);
  }
}

export async function searchMentionUsers(sectionId: string, query: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { data: [], error: 'Something went wrong' };
  }

  const validation = searchMentionUsersSchema.safeParse({
    sectionId,
    query,
  });
  if (!validation.success) {
    return { data: [], error: 'Invalid input' };
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: session.user.id },
        memberships: {
          some: { sectionId: validation.data.sectionId },
        },
        OR: [
          {
            name: {
              contains: validation.data.query,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: validation.data.query,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      orderBy: {
        reputationPoints: 'desc',
      },
      take: 5,
    });

    return {
      data: users.map((user) => {
        const base = (user.name || user.email.split('@')[0] || 'user')
          .toLowerCase()
          .replace(/[^a-z0-9.-]/g, '');

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          handle: base || 'user',
        };
      }),
      error: null,
    };
  } catch (error) {
    return handleActionError('searchMentionUsers', error);
  }
}
