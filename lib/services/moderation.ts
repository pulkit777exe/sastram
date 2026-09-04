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
  poll?: { question: string; options: string[]; expiresAt?: string | Date | null } | null;
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

const MODERATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOXICITY_BLOCK_THRESHOLD = 0.9;
const TOXICITY_FLAG_THRESHOLD = 0.5;
const EXCESSIVE_CAPS_RATIO = 0.6;
const EXCESSIVE_CAPS_MIN_LENGTH = 10;
const ESCALATING_TONE_HISTORY_NEEDED = 2;
const ESCALATING_TONE_MULTIPLIER = 1.5;
const RECENT_HISTORY_FOR_TOXICITY = 10;
const RECENT_HISTORY_FOR_CONTEXT = 5;

export class RegexFilter {
  private rulesCache: { compiledRules: Map<string, CompiledRule>; timestamp: number } | null = null;
  private readonly CACHE_TTL = MODERATION_CACHE_TTL_MS;

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
    const attachmentNames = (message.attachments ?? [])
      .map((att) => att.name)
      .filter((n): n is string => !!n);
    const subjects = [message.content, ...attachmentNames];

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
      const moderationCost = classifyAiCallCost(AiCallPath.TEXT_TOXICITY_MODERATION).estimatedCostUsd;
      await consumeSpendCap(moderationCost);

      const recentSlice = context.recentHistory.slice(-RECENT_HISTORY_FOR_TOXICITY);
      const formattedHistory = recentSlice.map((m) => `User ${m.senderId ?? 'unknown'}: ${m.content}`);
      const historyText = formattedHistory.join('\n');
      const threadText = `${historyText}\nNew message: ${message.content}`;

      let toxicity = 0;
      try {
        toxicity = await aiService.classifyToxicity(threadText);
      } catch (error) {
        logger.warn('Could not analyze content, defaulting to safe:', error);
      }

      // Clamp toxicity to valid confidence range.
      let confidence = toxicity;
      if (confidence < 0) confidence = 0;
      if (confidence > 1) confidence = 1;

      const threshold = env.MODERATION_CONFIDENCE_THRESHOLD || 0.7;

      if (confidence >= TOXICITY_BLOCK_THRESHOLD) {
        return { action: 'BLOCK', severity: 'HIGH', confidence, categories: ['toxicity', 'harmful'] };
      }
      if (confidence >= threshold) {
        return { action: 'REVIEW', severity: 'MEDIUM', confidence, categories: ['potential-violation'] };
      }
      if (confidence >= TOXICITY_FLAG_THRESHOLD) {
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

function averageLength(messages: Array<{ content: string }>): number {
  if (messages.length === 0) return 0;
  const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
  return totalLength / messages.length;
}

export class ContextualAnalyzer {
  async analyze(
    message: MessageLike,
    context: ConversationContext
  ): Promise<{ shouldEscalate: boolean; reason?: string }> {
    try {
      const recentMessages = context.recentHistory.slice(-RECENT_HISTORY_FOR_CONTEXT);

      const CAPS_RATIO_THRESHOLD = EXCESSIVE_CAPS_RATIO;
      const CAPS_MIN_LENGTH = EXCESSIVE_CAPS_MIN_LENGTH;
      const TONE_MULTIPLIER = ESCALATING_TONE_MULTIPLIER;
      const TONE_HISTORY_NEEDED = ESCALATING_TONE_HISTORY_NEEDED;

      const content = message.content;
      const upperMatches = content.match(/[A-Z]/g);
      let upperCount = 0;
      if (upperMatches) upperCount = upperMatches.length;
      let capsRatio = 0;
      if (content.length > 0) capsRatio = upperCount / content.length;
      const hasExcessiveCaps = capsRatio > CAPS_RATIO_THRESHOLD && content.length > CAPS_MIN_LENGTH;

      const avgLength = averageLength(recentMessages);
      const isMessageLongerThanAverage = message.content.length > avgLength * TONE_MULTIPLIER;
      const hasEnoughHistory = recentMessages.length > TONE_HISTORY_NEEDED;
      const escalatingTone = hasEnoughHistory && isMessageLongerThanAverage;

      let reason: string | undefined;
      if (hasExcessiveCaps) {
        reason = 'excessive-caps';
      } else if (escalatingTone) {
        reason = 'escalating-tone';
      }

      return {
        shouldEscalate: hasExcessiveCaps || escalatingTone,
        reason,
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
    let finalSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = (regexResult.severity as typeof finalSeverity) || 'LOW';
    const confidence: number = mlResult.confidence;
    let reason = regexResult.reason;

    const mlWantsBlock = mlResult.action === 'BLOCK';
    const mlWantsReview = mlResult.action === 'REVIEW';
    const shouldApplyMl = mlWantsBlock || (mlWantsReview && finalAction !== 'BLOCK');
    if (shouldApplyMl) {
      finalAction = mlResult.action;
      finalSeverity = mlResult.severity;
      reason = `ML analysis: ${mlResult.categories.join(', ')}`;
    }

    const isAllowedAndEscalated = ctxResult.shouldEscalate && finalAction === 'ALLOW';
    if (isAllowedAndEscalated) {
      finalAction = 'REVIEW';
      finalSeverity = 'MEDIUM';
      reason = `Contextual escalation: ${ctxResult.reason}`;
    }

    return {
      success: finalAction === 'ALLOW',
      action: finalAction,
      severity: finalSeverity,
      confidence,
      reason,
      pendingModeration: finalAction !== 'ALLOW',
    };
  }
}
