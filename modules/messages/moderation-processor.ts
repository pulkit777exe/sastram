import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { dispatch } from '@/modules/notifications/dispatcher';
import {
  MessageModerationPipeline,
  type MessageLike,
  type ConversationContext,
  type ModerationResult,
} from '@/lib/services/moderation';
import type { ReportCategory } from '@prisma/client';

export type { MessageLike, ConversationContext, ModerationResult };

const MAX_REPLY_DEPTH = 4;
const SYSTEM_USER_EMAIL = 'system@sastram.com';

function computeReplyDepth(parentDepth: number): number {
  const nextDepth = parentDepth + 1;
  if (nextDepth > MAX_REPLY_DEPTH) {
    return MAX_REPLY_DEPTH;
  }
  return nextDepth;
}

function toAttachmentType(raw: string | undefined): 'IMAGE' | 'GIF' | 'VIDEO' | 'FILE' {
  if (raw === 'GIF' || raw === 'VIDEO' || raw === 'FILE' || raw === 'IMAGE') {
    return raw;
  }
  return 'IMAGE';
}

async function getSystemUser() {
  return prisma.user.upsert({
    where: { email: SYSTEM_USER_EMAIL },
    create: { email: SYSTEM_USER_EMAIL, name: 'System', role: 'USER' },
    update: {},
  });
}

async function resolveReplyDepth(parentId: string | null): Promise<number> {
  if (!parentId) return 0;
  const parent = await prisma.message.findUnique({ where: { id: parentId }, select: { depth: true } });
  if (!parent) return 0;
  return computeReplyDepth(parent.depth);
}

function buildAttachmentCreate(
  attachments?: Array<{ url: string; type?: string; name?: string | null; size?: number | null }>
): { create: Array<{ url: string; type: 'IMAGE' | 'GIF' | 'VIDEO' | 'FILE'; name: string | null; size: bigint | null }> } | undefined {
  if (!attachments?.length) return undefined;
  const creates = attachments.map((att) => {
    let size: bigint | null;
    if (att.size !== undefined && att.size !== null) {
      size = BigInt(att.size);
    } else {
      size = null;
    }
    return {
      url: att.url,
      type: toAttachmentType(att.type),
      name: att.name ?? null,
      size,
    };
  });
  return { create: creates };
}

export class MessageService {
  private pipeline = new MessageModerationPipeline();

  async processMessage(
    message: MessageLike,
    context: ConversationContext
  ): Promise<ModerationResult> {
    const result = await this.pipeline.process(message, context);

    try {
      const depth = await resolveReplyDepth(message.parentId ?? null);
      const attachmentCreate = buildAttachmentCreate(message.attachments);

      const created = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            content: message.content,
            threadId: message.threadId,
            senderId: message.authorId,
            parentId: message.parentId ?? null,
            depth,
            attachments: attachmentCreate,
          },
          include: {
            attachments: true
          }
        });

        if (message.poll) {
          await tx.poll.create({
            data: {
              threadId: message.threadId,
              messageId: msg.id,
              question: message.poll.question,
              options: message.poll.options,
              expiresAt: message.poll.expiresAt ? new Date(message.poll.expiresAt) : null,
              isActive: true
            }
          });
        }

        if (message.parentId) {
          await tx.message.update({
            where: { id: message.parentId },
            data: { replyCount: { increment: 1 } },
          });
        }

        await tx.thread.update({
          where: { id: message.threadId },
          data: { messageCount: { increment: 1 } },
        });

        return msg;
      });

      if (result.action !== 'ALLOW') {
        const systemUser = await getSystemUser();

        await prisma.report.create({
          data: {
            messageId: created.id,
            reporterId: systemUser.id,
            category: 'OTHER' as ReportCategory,
            details: result.reason || undefined,
            status: 'PENDING',
          },
        });

        // Best-effort: a failed notification must not fail the post.
        const preview = (result.reason || 'content policy').substring(0, 120);
        await dispatch({
          recipients: { roles: ['MODERATOR', 'ADMIN'] },
          category: 'SYSTEM',
          title: `Auto-mod flagged: ${result.action}`,
          message: `Message in thread auto-flagged: ${preview}`,
          data: { messageId: created.id, action: result.action, autoMod: true },
        });
      }

      return {
        ...result,
        messageId: created.id,
        message: {
          ...created,
          sender: null,
          thread: null,
          attachments: created.attachments ?? [],
        },
      };
    } catch (error) {
      logger.error('Message processing error:', error);
      throw new Error(
        `Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
