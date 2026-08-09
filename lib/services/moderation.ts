import { prisma } from '@/lib/infrastructure/prisma';
import { env } from '@/lib/config/env';
import { aiService } from '@/lib/services/ai';
import { logger } from '@/lib/infrastructure/logger';
import { messageLimiter } from '@/lib/services/rate-limit';
import { createNotification } from '@/modules/notifications';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { classifyAiCallCost, AiCallPath } from '@/lib/services/ai-cost-classification';
import type { ReportCategory } from '@prisma/client';

export type MessageLike = {
  id?: string;
  content: string;
  authorId: string;
  threadId: string;
  parentId?: string | null;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
  attachments?: { name?: string | null; url: string; type: string; size?: number | null }[];
  poll?: { question: string; options: string[]; expiresAt?: string | null } | null;
};

export type ConversationContext = {
  threadId: string;
  participantIds: string[];
  recentHistory: Array<{
    id: string;
    content: string;
    senderId: string | null;
    createdAt: Date;
  }>;
  threadMetadata?: Record<string, unknown>;
  relationships?: Map<string, unknown>;
};

export type ModerationResult = {
  success: boolean;
  action: 'ALLOW' | 'BLOCK' | 'REVIEW' | 'FLAG';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason?: string;
  confidence?: number;
  messageId?: string;
  message?: {
    id: string;
    content: string;
    threadId: string;
    senderId: string | null;
    parentId: string | null;
    depth: number;
    createdAt: Date;
    updatedAt: Date;
    sender?: { id: string; name: string | null; image: string | null } | null;
    thread?: { id: string; name: string; slug: string } | null;
    attachments?: Array<{ id: string; url: string; type: string; name: string | null; size: bigint | null }>;
  } | null;
  pendingModeration?: boolean;
};

// Auto-mod reports and bans need an actor row; this is that placeholder.
async function getSystemUser() {
  return prisma.user.upsert({
    where: { email: 'system@sastram.com' },
    create: { email: 'system@sastram.com', name: 'System', role: 'ADMIN' },
    update: {},
  });
}

export class RateLimitFilter {
  async check(message: MessageLike, _context: ConversationContext): Promise<ModerationResult> {
    const result = await messageLimiter.check(message.authorId);
    if (!result.success) {
      return {
        success: false,
        action: 'BLOCK',
        severity: 'MEDIUM',
        reason: 'Rate limit exceeded. Please slow down.',
      };
    }
    return { success: true, action: 'ALLOW' };
  }
}

type CompiledRule = { regex: RegExp; action: string; severity: string; category: string };
type RawRule = { id: string; pattern: string; action: string; severity: string; category: string };

export class RegexFilter {
  private rulesCache: { compiledRules: Map<string, CompiledRule>; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  async check(message: MessageLike): Promise<ModerationResult> {
    let compiledRules = this.getCompiledRulesFromCache();
    if (!compiledRules) {
      const rules = await prisma.moderationRule.findMany({
        select: { id: true, pattern: true, action: true, severity: true, category: true },
      });
      compiledRules = this.cacheRules(rules);
    }

    // Attachment filenames are checked too — they render in the UI and are an
    // easy way to smuggle banned text past a content-only filter.
    const subjects = [
      message.content,
      ...(message.attachments ?? []).map((att) => att.name).filter((n): n is string => !!n),
    ];

    for (const subject of subjects) {
      const match = this.firstMatch(compiledRules, subject);
      if (match) {
        return {
          success: false,
          action: match.action as 'BLOCK' | 'REVIEW' | 'FLAG',
          severity: match.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          reason: `Matched rule: ${match.category}`,
        };
      }
    }

    return { success: true, action: 'ALLOW' };
  }

  private firstMatch(rules: Map<string, CompiledRule>, text: string): CompiledRule | null {
    for (const [ruleId, rule] of rules) {
      try {
        if (rule.regex.test(text)) return rule;
      } catch (error) {
        // A pathological pattern shouldn't take the whole filter down.
        logger.warn(`Invalid regex pattern for rule ${ruleId}:`, error);
      }
    }
    return null;
  }

  private getCompiledRulesFromCache(): Map<string, CompiledRule> | null {
    if (!this.rulesCache) return null;
    const now = Date.now();
    if (now - this.rulesCache.timestamp > this.CACHE_TTL) {
      this.rulesCache = null;
      return null;
    }
    return this.rulesCache.compiledRules;
  }

  private cacheRules(rules: RawRule[]): Map<string, CompiledRule> {
    const compiledRules = new Map<string, CompiledRule>();
    for (const rule of rules) {
      try {
        compiledRules.set(rule.id, {
          regex: new RegExp(rule.pattern, 'i'),
          action: rule.action,
          severity: rule.severity,
          category: rule.category,
        });
      } catch (error) {
        logger.warn(`Failed to compile regex for rule ${rule.id}:`, error);
      }
    }
    this.rulesCache = { compiledRules, timestamp: Date.now() };
    return compiledRules;
  }
}

export class MLClassifier {
  async analyze(
    message: MessageLike,
    context: ConversationContext
  ): Promise<{
    action: 'ALLOW' | 'BLOCK' | 'REVIEW' | 'FLAG';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence: number;
    categories: string[];
  }> {
    if (!env.CONTENT_MODERATION_ENABLED || !env.GEMINI_API_KEY) {
      return {
        action: 'ALLOW',
        severity: 'LOW',
        confidence: 0,
        categories: [],
      };
    }

    try {
      // Moderation is classified CHEAP so the cost gate always passes, but the
      // spend still has to be accounted against the global daily cap.
      await consumeSpendCap(classifyAiCallCost(AiCallPath.TEXT_TOXICITY_MODERATION).estimatedCostUsd);

      const threadText =
        context.recentHistory
          .slice(-10)
          .map((m) => `User ${m.senderId ?? 'unknown'}: ${m.content}`)
          .join('\n') + `\nNew message: ${message.content}`;

      let toxicity = 0;
      try {
        toxicity = await aiService.classifyToxicity(threadText);
      } catch (error) {
        logger.warn('Could not analyze content, defaulting to safe:', error);
      }

      const confidence = Math.min(1, Math.max(0, toxicity));
      const threshold = env.MODERATION_CONFIDENCE_THRESHOLD || 0.7;

      if (confidence >= 0.9) {
        return { action: 'BLOCK', severity: 'HIGH', confidence, categories: ['toxicity', 'harmful'] };
      }
      if (confidence >= threshold) {
        return { action: 'REVIEW', severity: 'MEDIUM', confidence, categories: ['potential-violation'] };
      }
      if (confidence >= 0.5) {
        return { action: 'FLAG', severity: 'LOW', confidence, categories: ['review-suggested'] };
      }

      return { action: 'ALLOW', severity: 'LOW', confidence, categories: [] };
    } catch (error) {
      logger.error('ML classifier error:', error);
      return {
        action: 'REVIEW',
        severity: 'LOW',
        confidence: 0,
        categories: ['ml-error'],
      };
    }
  }
}

export class ContextualAnalyzer {
  async analyze(
    message: MessageLike,
    context: ConversationContext
  ): Promise<{ shouldEscalate: boolean; reason?: string }> {
    try {
      const recentMessages = context.recentHistory.slice(-5);

      const hasExcessiveCaps =
        (message.content.match(/[A-Z]/g) || []).length > message.content.length * 0.6 &&
        message.content.length > 10;

      // A message much longer than the recent average often means a rant.
      const avgLength = recentMessages.length
        ? recentMessages.reduce((sum, m) => sum + m.content.length, 0) / recentMessages.length
        : 0;
      const escalatingTone = recentMessages.length > 2 && message.content.length > avgLength * 1.5;

      return {
        shouldEscalate: hasExcessiveCaps || escalatingTone,
        reason: hasExcessiveCaps
          ? 'excessive-caps'
          : escalatingTone
            ? 'escalating-tone'
            : undefined,
      };
    } catch (error) {
      logger.error('Contextual analyzer error:', error);
      return { shouldEscalate: false };
    }
  }
}

export class MessageModerationPipeline {
  private rateLimitFilter = new RateLimitFilter();
  private regexFilter = new RegexFilter();
  private mlClassifier = new MLClassifier();
  private contextualAnalyzer = new ContextualAnalyzer();

  async process(message: MessageLike, context: ConversationContext): Promise<ModerationResult> {
    const rateResult = await this.rateLimitFilter.check(message, context);
    if (!rateResult.success && rateResult.action === 'BLOCK') {
      return rateResult;
    }

    const regexResult = await this.regexFilter.check(message);
    if (!regexResult.success && regexResult.action === 'BLOCK') {
      return regexResult;
    }

    const mlResult = await this.mlClassifier.analyze(message, context);
    const ctxResult = await this.contextualAnalyzer.analyze(message, context);

    // Start from the regex verdict, then let ML and context only escalate it.
    let finalAction: 'ALLOW' | 'BLOCK' | 'REVIEW' | 'FLAG' = regexResult.action;
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = regexResult.severity || 'LOW';
    const confidence: number = mlResult.confidence;
    let reason = regexResult.reason;

    if (mlResult.action === 'BLOCK' || (mlResult.action === 'REVIEW' && finalAction !== 'BLOCK')) {
      finalAction = mlResult.action;
      severity = mlResult.severity;
      reason = `ML analysis: ${mlResult.categories.join(', ')}`;
    }

    if (ctxResult.shouldEscalate && finalAction === 'ALLOW') {
      finalAction = 'REVIEW';
      severity = 'MEDIUM';
      reason = `Contextual escalation: ${ctxResult.reason}`;
    }

    return {
      success: finalAction === 'ALLOW',
      action: finalAction,
      severity,
      confidence,
      reason,
      pendingModeration: finalAction !== 'ALLOW',
    };
  }
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
          await Promise.all(
            mods.map((mod) =>
              createNotification({
                userId: mod.id,
                type: 'SYSTEM',
                title: `Auto-mod flagged: ${result.action}`,
                message: `Message in thread auto-flagged: ${(result.reason || 'content policy').substring(0, 120)}`,
                data: { messageId: created.id, action: result.action, autoMod: true },
              })
            )
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

export class ModerationDashboard {
  async getQueue(params?: { status?: string }) {
    const whereClause: Record<string, unknown> = { status: params?.status || 'PENDING' };

    return prisma.report.findMany({
      where: whereClause,
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            thread: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
  }

  async resolveCase(reportId: string, action: 'BLOCK' | 'ALLOW' | 'FLAG', reason: string) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { message: true },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === 'ALLOW' ? 'DISMISSED' : 'RESOLVED',
        resolvedBy: action === 'ALLOW' ? null : report.reporterId,
        resolution: reason,
      },
    });

    if (action === 'BLOCK') {
      const systemUser = await getSystemUser();

      await prisma.userBan.create({
        data: {
          userId: report.message.senderId,
          bannedBy: systemUser.id,
          reason,
          threadId: report.message.threadId,
        },
      });
    }
  }
}
