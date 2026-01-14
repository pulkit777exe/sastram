import { prisma } from "@/lib/infrastructure/prisma";
import { env } from "@/lib/config/env";
import { containsBadLanguage } from "@/lib/services/content-safety";
import { aiService } from "@/lib/services/ai";
import type {
  AppealStatus,
  ModerationAction,
  ModerationDecision,
  ModerationSeverity,
  ModerationStatus,
} from "@prisma/client";

export type MessageLike = {
  id?: string;
  content: string;
  authorId: string;
  sectionId: string;
  parentId?: string | null;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
};

export type ConversationContext = {
  sectionId: string;
  participantIds: string[];
  recentHistory: Array<{
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
  }>;
  sectionMetadata?: Record<string, unknown>;
  relationships?: Map<string, unknown>;
};

export type ModerationResult = {
  success: boolean;
  action: ModerationAction;
  severity?: ModerationSeverity;
  reason?: string;
  confidence?: number;
  messageId?: string;
  pendingModeration?: boolean;
};

export class RateLimitFilter {
  async check(
    _message: MessageLike,
    _context: ConversationContext
  ): Promise<ModerationResult> {
    return {
      success: true,
      action: "ALLOW",
    };
  }
}

export class RegexFilter {
  async check(message: MessageLike): Promise<ModerationResult> {
    try {
      const lowered = message.content.toLowerCase();
      const rules = await prisma.contentSafetyRule.findMany();

      for (const rule of rules) {
        try {
          const regex = new RegExp(rule.pattern, "i");
          if (regex.test(lowered)) {
            return {
              success: rule.action === "ALLOW",
              action: rule.action,
              severity: rule.severity as ModerationSeverity,
              reason: `Matched content safety rule (${rule.category})`,
            };
          }
        } catch (error) {
          console.error(`Invalid regex pattern: ${rule.pattern}`, error);
          continue;
        }
      }

      if (containsBadLanguage(message.content)) {
        return {
          success: false,
          action: "BLOCK",
          severity: "MEDIUM",
          reason: "Matched default bad language filter",
        };
      }

      return {
        success: true,
        action: "ALLOW",
      };
    } catch (error) {
      console.error("Regex filter error:", error);
      return {
        success: true,
        action: "ALLOW",
      };
    }
  }
}

export class MLClassifier {
  async analyze(
    message: MessageLike,
    context: ConversationContext
  ): Promise<{
    action: ModerationAction;
    severity: ModerationSeverity;
    confidence: number;
    categories: string[];
  }> {
    if (!env.CONTENT_MODERATION_ENABLED || !env.GEMINI_API_KEY) {
      return {
        action: "ALLOW",
        severity: "LOW",
        confidence: 0,
        categories: [],
      };
    }

    try {
      const threadText =
        context.recentHistory
          .slice(-10)
          .map((m) => `User ${m.senderId}: ${m.content}`)
          .join("\n") + `\nNew message: ${message.content}`;

      let toxicity = 0;
      
      if ('analyzeContent' in aiService && typeof aiService.analyzeContent === 'function') {
        const analysis = await (aiService).analyzeContent(threadText);
        toxicity = analysis.toxicity || 0;
      } else {
        try {
          const summary = await aiService.generateSummary(
            `Analyze this conversation for toxic content. Rate toxicity 0-1:\n${threadText}`
          );
          const match = summary.match(/toxicity[:\s]+([0-9.]+)/i);
          toxicity = match ? parseFloat(match[1]) : 0;
        } catch (error) {
          console.warn("Could not analyze content, defaulting to safe:", error);
          toxicity = 0;
        }
      }

      const confidence = Math.min(1, Math.max(0, toxicity));
      const threshold = env.MODERATION_CONFIDENCE_THRESHOLD || 0.7;

      let action: ModerationAction = "ALLOW";
      let severity: ModerationSeverity = "LOW";
      const categories: string[] = [];

      if (confidence >= 0.9) {
        action = "BLOCK";
        severity = "HIGH";
        categories.push("toxicity", "harmful");
      } else if (confidence >= threshold) {
        action = "REVIEW";
        severity = "MEDIUM";
        categories.push("potential-violation");
      } else if (confidence >= 0.5) {
        action = "FLAG";
        severity: "LOW";
        categories.push("review-suggested");
      }

      return {
        action,
        severity,
        confidence,
        categories,
      };
    } catch (error) {
      console.error("ML classifier error:", error);
      return {
        action: "REVIEW",
        severity: "LOW",
        confidence: 0,
        categories: ["ml-error"],
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

      const hasExcessiveCaps = (message.content.match(/[A-Z]/g) || []).length >
        message.content.length * 0.6 && message.content.length > 10;

      let escalatingTone = false;
      if (recentMessages.length > 2) {
        const avgLength =
          recentMessages.reduce((sum, m) => sum + m.content.length, 0) /
          recentMessages.length;
        if (message.content.length > avgLength * 1.5) {
          escalatingTone = true;
        }
      }

      const shouldEscalate = hasExcessiveCaps || escalatingTone;

      return {
        shouldEscalate,
        reason: hasExcessiveCaps
          ? "excessive-caps"
          : escalatingTone
            ? "escalating-tone"
            : undefined,
      };
    } catch (error) {
      console.error("Contextual analyzer error:", error);
      return { shouldEscalate: false };
    }
  }
}

export class MessageModerationPipeline {
  private rateLimitFilter = new RateLimitFilter();
  private regexFilter = new RegexFilter();
  private mlClassifier = new MLClassifier();
  private contextualAnalyzer = new ContextualAnalyzer();

  async process(
    message: MessageLike,
    context: ConversationContext
  ): Promise<ModerationResult> {
    const rateResult = await this.rateLimitFilter.check(message, context);
    if (!rateResult.success && rateResult.action === "BLOCK") {
      return rateResult;
    }

    const regexResult = await this.regexFilter.check(message);
    if (!regexResult.success && regexResult.action === "BLOCK") {
      return regexResult;
    }

    const mlResult = await this.mlClassifier.analyze(message, context);

    const ctxResult = await this.contextualAnalyzer.analyze(
      message,
      context
    );

    let finalAction: ModerationAction = regexResult.action;
    let severity: ModerationSeverity = regexResult.severity || "LOW";
    const confidence: number = mlResult.confidence;
    let reason = regexResult.reason;

    if (
      mlResult.action === "BLOCK" ||
      (mlResult.action === "REVIEW" && finalAction !== "BLOCK")
    ) {
      finalAction = mlResult.action;
      severity = mlResult.severity;
      reason = `ML analysis: ${mlResult.categories.join(", ")}`;
    }

    if (ctxResult.shouldEscalate && finalAction === "ALLOW") {
      finalAction = "REVIEW";
      severity = "MEDIUM";
      reason = `Contextual escalation: ${ctxResult.reason}`;
    }

    return {
      success: finalAction === "ALLOW",
      action: finalAction,
      severity,
      confidence,
      reason,
      pendingModeration: finalAction !== "ALLOW",
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

    let dbMessageId: string | undefined;

    try {
      // Create the message first
      const created = await prisma.message.create({
        data: {
          content: message.content,
          sectionId: message.sectionId,
          senderId: message.authorId,
          parentId: message.parentId ?? null,
        },
      });
      dbMessageId = created.id;

      // If moderation action is needed, add to queue
      if (result.action !== "ALLOW") {
        // Determine status based on action
        let status: ModerationStatus = "QUEUED";
        if (result.action === "BLOCK") {
          status = "BLOCKED";
        } else if (result.action === "FLAG") {
          status = "FLAGGED";
        } else if (result.action === "REVIEW") {
          status = "QUEUED";
        }

        await prisma.moderationQueue.create({
          data: {
            messageId: created.id,
            status,
            reason: result.reason || undefined,
            confidence: result.confidence || undefined,
            context: result.reason ? { categories: [result.reason] } : undefined,
          },
        });
      }
    } catch (error) {
      console.error("Message processing error:", error);
      throw new Error(
        `Failed to process message: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return {
      ...result,
      messageId: dbMessageId,
    };
  }
}

export class ModerationDashboard {
  async getQueue(params?: { status?: ModerationStatus }) {
    return prisma.moderationQueue.findMany({
      where: {
        status: params?.status,
      },
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            section: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      // Fix: Remove 'priority' field - schema doesn't have it
      // Order by status (BLOCKED/FLAGGED first) then creation date
      orderBy: [
        { status: "desc" }, // BLOCKED/FLAGGED will be prioritized
        { createdAt: "desc" }
      ],
      take: 50,
    });
  }

  async resolveCase(
    queueId: string,
    action: ModerationAction,
    reason: string
  ) {
    const queueItem = await prisma.moderationQueue.findUnique({
      where: { id: queueId },
      include: { message: true },
    });

    if (!queueItem) {
      throw new Error("Queue item not found");
    }

    // Map action to status
    const status: ModerationStatus =
      action === "BLOCK"
        ? "BLOCKED"
        : action === "ALLOW"
          ? "APPROVED"
          : "FLAGGED";

    await prisma.moderationQueue.update({
      where: { id: queueId },
      data: {
        status,
        reviewedAt: new Date(),
      },
    });

    // Log the moderation action
    await prisma.moderationActionLog.create({
      data: {
        action: action === "BLOCK" ? "MESSAGE_BLOCKED" : action === "ALLOW" ? "MESSAGE_ALLOWED" : "MESSAGE_FLAGGED",
        messageId: queueItem.messageId,
        details: { reason },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: "REPORT_RESOLVED",
        entityType: "Message",
        entityId: queueItem.messageId,
        details: { moderationAction: action, reason },
      },
    });
  }
}

export class AppealsSystem {
  async submitAppeal(input: {
    messageId: string;
    userId: string;
    reason: string;
  }) {
    const existing = await prisma.appeal.findFirst({
      where: {
        messageId: input.messageId,
        userId: input.userId,
      },
    });

    if (existing) {
      throw new Error("You have already appealed this message");
    }

    // Find the queue item for this message
    const queueItem = await prisma.moderationQueue.findFirst({
      where: { messageId: input.messageId },
    });

    return prisma.appeal.create({
      data: {
        messageId: input.messageId,
        userId: input.userId,
        queueId: queueItem?.id || null,
        reason: input.reason,
        status: "PENDING" as AppealStatus,
      },
    });
  }

  async reviewAppeal(params: {
    appealId: string;
    moderatorId: string;
    decision: "APPROVE" | "DENY";
    response?: string;
  }) {
    const appeal = await prisma.appeal.findUnique({
      where: { id: params.appealId },
      include: { message: true, queue: true },
    });

    if (!appeal) {
      throw new Error("Appeal not found");
    }

    const status: AppealStatus =
      params.decision === "APPROVE" ? "APPROVED" : "DENIED";

    const updated = await prisma.appeal.update({
      where: { id: params.appealId },
      data: {
        moderatorId: params.moderatorId,
        status,
        response: params.response,
        resolvedAt: new Date(),
      },
    });

    // If approved, update the moderation queue status
    if (params.decision === "APPROVE" && appeal.queueId) {
      await prisma.moderationQueue.update({
        where: { id: appeal.queueId },
        data: { status: "APPROVED" },
      });
      
      // Log the action
      await prisma.moderationActionLog.create({
        data: {
          action: "APPEAL_APPROVED",
          messageId: appeal.messageId,
          actorId: params.moderatorId,
          details: { appealId: params.appealId, response: params.response },
        },
      });
    } else if (params.decision === "DENY") {
      await prisma.moderationActionLog.create({
        data: {
          action: "APPEAL_DENIED",
          messageId: appeal.messageId,
          actorId: params.moderatorId,
          details: { appealId: params.appealId, response: params.response },
        },
      });
    }

    return updated;
  }
}

export class ModerationMetrics {
  async recordDecision(decision: ModerationDecision) {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setHours(0, 0, 0, 0);
    
    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    try {
      // Find existing stats for today
      const existing = await prisma.moderationStats.findFirst({
        where: {
          windowStart: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      });

      if (existing) {
        // Update existing record
        await prisma.moderationStats.update({
          where: { id: existing.id },
          data: {
            blockedCount: {
              increment: decision === "REJECT" ? 1 : 0,
            },
            allowedCount: {
              increment: decision === "APPROVE" ? 1 : 0,
            },
            flaggedCount: {
              increment: decision === "ESCALATE" ? 1 : 0,
            },
          },
        });
      } else {
        // Create new record
        await prisma.moderationStats.create({
          data: {
            windowStart,
            windowEnd,
            blockedCount: decision === "REJECT" ? 1 : 0,
            allowedCount: decision === "APPROVE" ? 1 : 0,
            flaggedCount: decision === "ESCALATE" ? 1 : 0,
          },
        });
      }
    } catch (error) {
      console.error("Failed to record moderation decision:", error);
    }
  }

  async getDailyStats() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    return prisma.moderationStats.findFirst({
      where: {
        windowStart: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });
  }
}

export class PrivacyPreservingModeration {
  anonymizeText(text: string): string {
    return text
      .replace(/@[a-zA-Z0-9_]+/g, "@user")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]")
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, "[phone]")
      .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, "[card]");
  }
}