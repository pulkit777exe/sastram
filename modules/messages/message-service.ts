/**
 * Message creation service — persists messages, handles polls, creates auto-mod reports.
 *
 * Extracted from lib/services/moderation.ts during the architecture restructure.
 * Moderation pipeline lives in moderation.ts; this file owns the write-side flow.
 */

import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { createBulkNotifications } from '@/modules/notifications';
import { MessageModerationPipeline, type MessageLike, type ConversationContext, type ModerationResult } from './moderation';
import type { ReportCategory } from '@prisma/client';

// Auto-mod reports and bans need an actor row; this is that placeholder.
async function getSystemUser() {
  return prisma.user.upsert({
    where: { email: 'system@sastram.com' },
    create: { email: 'system@sastram.com', name: 'System', role: 'USER' },
    update: {},
  });
}

export class MessageService {
  private pipeline = new MessageModerationPipeline();

  async processMessage(
    message: MessageLike,
    context: ConversationContext
  ): Promise<ModerationResult> {
    const result = await this.pipeline.process(message, context);

    try {
      // Replies are nested at most 4 deep; beyond that they flatten onto the parent.
      let depth = 0;
      if (message.parentId) {
        const parent = await prisma.message.findUnique({
          where: { id: message.parentId },
          select: { depth: true },
        });
        if (parent) {
          depth = Math.min(parent.depth + 1, 4);
        }
      }

      const created = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            content: message.content,
            threadId: message.threadId,
            senderId: message.authorId,
            parentId: message.parentId ?? null,
            depth,
            attachments: message.attachments ? {
              create: message.attachments.map(att => ({
                url: att.url,
                type: (att.type || 'IMAGE') as 'IMAGE' | 'GIF' | 'VIDEO' | 'FILE',
                name: att.name ?? null,
                size: att.size !== undefined && att.size !== null ? BigInt(att.size) : null
              }))
            } : undefined
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

        try {
          const mods = await prisma.user.findMany({
            where: { role: { in: ['MODERATOR', 'ADMIN'] }, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          await createBulkNotifications(
            mods.map((mod) => ({
              userId: mod.id,
              type: 'SYSTEM' as const,
              title: `Auto-mod flagged: ${result.action}`,
              message: `Message in thread auto-flagged: ${(result.reason || 'content policy').substring(0, 120)}`,
              data: { messageId: created.id, action: result.action, autoMod: true },
            }))
          );
        } catch (err) {
          // The message is already stored; a failed notification shouldn't
          // fail the post.
          logger.error('[moderation] Failed to notify moderators', err);
        }
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
