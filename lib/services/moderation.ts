import { prisma } from '@/lib/infrastructure/prisma';
import { env } from '@/lib/config/env';
import { aiService } from '@/lib/ai';
import { logger } from '@/lib/infrastructure/logger';
import { getMessageLimiter } from '@/lib/services/rate-limit';
import { consumeSpendCap } from '@/lib/services/ai-spend-cap';
import { classifyAiCallCost, AiCallPath } from '@/lib/services/ai-cost-classification';

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

export class RateLimitFilter {
  async check(message: MessageLike, _context: ConversationContext): Promise<ModerationResult> {
    const result = await getMessageLimiter().check(message.authorId);
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
