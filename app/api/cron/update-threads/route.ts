import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { aiService } from "@/lib/services/ai";
import { notifyMultipleUsers } from "@/modules/notifications/repository";
import { NotificationType } from "@prisma/client";
import { updateAllThreadRelations } from "@/modules/threads/relations";
import { prewarmFollowUpQueries } from "@/modules/ai-search/query-warming";

export async function GET(req: NextRequest) {
  // Verify Cron Secret (optional but recommended for production)
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all active threads
    const threads = await prisma.section.findMany({
      where: {
        // Only process threads that have been active in the last 30 days
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        messages: {
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || "50", 10),
          orderBy: { createdAt: "desc" },
          include: { sender: true },
        },
        subscriptions: true,
      },
    });

    const results = {
      processed: 0,
      updatedDNA: 0,
      updatedScore: 0,
      markedOutdated: 0,
      sentNotifications: 0,
      relationsUpdated: 0,
      prewarmedQueries: 0,
      errors: 0,
    };

  // Process threads with controlled concurrency using a promise pool
  async function processWithConcurrency(
    items: any[],
    concurrency: number,
    processor: (item: any) => Promise<void>,
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const activePromises: Promise<void>[] = [];

    for (const item of items) {
      const promise = processor(item).finally(() => {
        const index = activePromises.indexOf(promise);
        if (index > -1) {
          activePromises.splice(index, 1);
        }
      });

      activePromises.push(promise);
      promises.push(promise);

      if (activePromises.length >= concurrency) {
        await Promise.race(activePromises);
      }
    }

    await Promise.all(promises);
  }

  const concurrencyLimit = parseInt(process.env.CRON_CONCURRENCY_LIMIT || "5", 10);
  const processThread = async (thread: any) => {
    try {
      results.processed++;

      // Skip threads with no messages
      if (thread.messages.length === 0) {
        return;
      }

      // Reverse to chronological order for AI
      const messages = thread.messages.reverse();

      // Update thread DNA
      const threadDNA = await aiService.generateThreadDNA(messages);
      await prisma.section.update({
        where: { id: thread.id },
        data: { threadDna: threadDNA },
      });
      results.updatedDNA++;

      // Update resolution score and check for significant changes
      const oldScore = thread.resolutionScore;
      const newScore = await aiService.calculateResolutionScore(messages);
      await prisma.section.update({
        where: { id: thread.id },
        data: { resolutionScore: newScore },
      });
      results.updatedScore++;

      // Check staleness (simple heuristic for now)
      const isOutdated = thread.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (isOutdated) {
        await prisma.section.update({
          where: { id: thread.id },
          data: { isOutdated, lastVerifiedAt: new Date() },
        });
        results.markedOutdated++;
      }

      // Detect conflicts in messages
      const conflictResult = await aiService.detectConflicts(messages);
      if (conflictResult.hasConflict) {
        await prisma.section.update({
          where: { id: thread.id },
          data: { 
            isOutdated: true,
            lastVerifiedAt: new Date(),
          },
        });
        results.markedOutdated++;
      }

      // Send AI insight notifications to subscribers
      const subscriberIds = thread.subscriptions.map((sub: any) => sub.userId);
      if (subscriberIds.length > 0) {
        const notifications = [];
        
        // Send resolution score change notification if significant (>= 20 points)
        if (oldScore !== null && Math.abs(newScore - oldScore) >= 20) {
          notifications.push({
            userIds: subscriberIds,
            type: NotificationType.AI_INSIGHT,
            title: `Resolution score updated for "${thread.name}"`,
            message: `The resolution score for this thread has changed from ${oldScore} to ${newScore}.`,
            data: {
              threadId: thread.id,
              threadName: thread.name,
              oldScore,
              newScore,
              type: "resolution_score_change"
            }
          });
        }

        // Send outdated thread notification
        if (isOutdated) {
          notifications.push({
            userIds: subscriberIds,
            type: NotificationType.AI_INSIGHT,
            title: `Thread "${thread.name}" may be outdated`,
            message: "This thread hasn't been updated in over a week and may contain outdated information.",
            data: {
              threadId: thread.id,
              threadName: thread.name,
              type: "thread_outdated"
            }
          });
        }

        // Send conflict detection notification
        if (conflictResult.hasConflict) {
          notifications.push({
            userIds: subscriberIds,
            type: NotificationType.AI_INSIGHT,
            title: `Conflict detected in "${thread.name}"`,
            message: conflictResult.reason || "A conflict has been detected in this thread. Please review the messages.",
            data: {
              threadId: thread.id,
              threadName: thread.name,
              conflictingMessages: conflictResult.conflictingMessages,
              type: "conflict_detected"
            }
          });
        }

        // Send all notifications
        for (const notification of notifications) {
          await notifyMultipleUsers(
            notification.userIds,
            notification.type,
            notification.title,
            notification.message,
            notification.data
          );
          results.sentNotifications += notification.userIds.length;
        }
      }
    } catch (error) {
      console.error(`Failed to process thread ${thread.id}:`, error);
      results.errors++;
    }
  };

    // Process threads with controlled concurrency
    await processWithConcurrency(threads, concurrencyLimit, processThread);

    // Update thread relations
    const relationsResult = await updateAllThreadRelations();
    results.relationsUpdated = relationsResult.updated;

    // Pre-warm follow-up queries
    const prewarmResult = await prewarmFollowUpQueries();
    results.prewarmedQueries = prewarmResult.prewarmed;

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Update threads cron error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
