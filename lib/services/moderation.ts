import { prisma } from "@/lib/infrastructure/prisma";
import { env } from "@/lib/config/env";
import { containsBadLanguage } from "@/lib/services/content-safety";
import { aiService } from "@/lib/services/ai";
import type { ReportCategory } from "@prisma/client";

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
  action: "ALLOW" | "BLOCK" | "REVIEW" | "FLAG";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason?: string;
  confidence?: number;
  messageId?: string;
  pendingModeration?: boolean;
};

export class RateLimitFilter {
  async check(
    _message: MessageLike,
    _context: ConversationContext,
  ): Promise<ModerationResult> {
    return {
      success: true,
      action: "ALLOW",
    };
  }
}

export class RegexFilter {
  async check(message: MessageLike): Promise<ModerationResult> {
    const lowered = message.content.toLowerCase();

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
  }
}

export class MLClassifier {
  async analyze(
    message: MessageLike,
    context: ConversationContext,
  ): Promise<{
    action: "ALLOW" | "BLOCK" | "REVIEW" | "FLAG";
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
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

      if (
        "analyzeContent" in aiService &&
        typeof aiService.analyzeContent === "function"
      ) {
        const analysis = await aiService.analyzeContent(threadText);
        toxicity = analysis.toxicity || 0;
      } else {
        try {
          const summary = await aiService.generateSummary(
            `Analyze this conversation for toxic content. Rate toxicity 0-1:\n${threadText}`,
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

      let action: "ALLOW" | "BLOCK" | "REVIEW" | "FLAG" = "ALLOW";
      let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
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
        severity = "LOW";
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
    context: ConversationContext,
  ): Promise<{ shouldEscalate: boolean; reason?: string }> {
    try {
      const recentMessages = context.recentHistory.slice(-5);

      const hasExcessiveCaps =
        (message.content.match(/[A-Z]/g) || []).length >
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
    context: ConversationContext,
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

    const ctxResult = await this.contextualAnalyzer.analyze(message, context);

    let finalAction: "ALLOW" | "BLOCK" | "REVIEW" | "FLAG" = regexResult.action;
    let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = regexResult.severity || "LOW";
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
    context: ConversationContext,
  ): Promise<ModerationResult> {
    const result = await this.pipeline.process(message, context);

    let dbMessageId: string | undefined;

    try {
      // Calculate depth from parent
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

      // Create the message first
      const created = await prisma.message.create({
        data: {
          content: message.content,
          sectionId: message.sectionId,
          senderId: message.authorId,
          parentId: message.parentId ?? null,
          depth,
        },
      });

      // Atomically increment parent's replyCount
      if (message.parentId) {
        await prisma.message.update({
          where: { id: message.parentId },
          data: { replyCount: { increment: 1 } },
        });
      }
      dbMessageId = created.id;

      // If moderation action is needed, create a report
      if (result.action !== "ALLOW") {
        await prisma.report.create({
          data: {
            messageId: created.id,
            reporterId: "system",
            category: "OTHER" as ReportCategory,
            details: result.reason || undefined,
            status: "PENDING",
          },
        });
      }
    } catch (error) {
      console.error("Message processing error:", error);
      throw new Error(
        `Failed to process message: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return {
      ...result,
      messageId: dbMessageId,
    };
  }
}

export class ModerationDashboard {
  async getQueue(params?: { status?: string }) {
    const whereClause: Record<string, unknown> = {
      status: params?.status || "PENDING",
    };

    return prisma.report.findMany({
      where: whereClause,
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
      orderBy: [
        { createdAt: "desc" },
      ],
      take: 50,
    });
  }

  async resolveCase(reportId: string, action: "BLOCK" | "ALLOW" | "FLAG", reason: string) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { message: true },
    });

    if (!report) {
      throw new Error("Report not found");
    }

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === "ALLOW" ? "DISMISSED" : "RESOLVED",
        resolvedBy: action === "ALLOW" ? null : report.reporterId,
        resolution: reason,
      },
    });

    // If action is BLOCK, create a ban
    if (action === "BLOCK") {
      await prisma.userBan.create({
        data: {
          userId: report.message.senderId,
          bannedBy: "system",
          reason,
          threadId: report.message.sectionId,
        },
      });
    }
  }
}
