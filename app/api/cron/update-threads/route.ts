import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { getAiJobQueue, AIJobType } from "@/lib/infrastructure/bullmq";
import { updateAllThreadRelations } from "@/modules/threads/relations";
import { prewarmFollowUpQueries } from "@/modules/ai-search/query-warming";

export async function GET(req: NextRequest) {
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

    const jobPromises = [];
    const aiJobQueue = getAiJobQueue();

    // Process each thread and collect data for notifications
    for (const thread of threads) {
      if (thread.messages.length === 0) {
        continue;
      }

      // Reverse to chronological order for AI
      const messages = thread.messages.reverse();
      const subscriberIds = thread.subscriptions.map((sub: any) => sub.userId);

      // Check staleness (simple heuristic for now)
      const isOutdated = thread.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Add jobs for each AI task
      jobPromises.push(
        aiJobQueue.add(
          AIJobType.GENERATE_THREAD_DNA,
          { threadId: thread.id, messages, cronJob: true },
          { jobId: `generate-dna-${thread.id}-${Date.now()}` }
        )
      );

      // For resolution score, we need both old and new values for notifications
      const oldScore = thread.resolutionScore;
      jobPromises.push(
        (async () => {
          const { aiService } = await import('@/lib/services/ai');
          const newScore = await aiService.calculateResolutionScore(messages);
          
          await prisma.section.update({
            where: { id: thread.id },
            data: { resolutionScore: newScore },
          });

          // If there are subscribers and score changed significantly, add notification job
          if (subscriberIds.length > 0 && oldScore !== null && Math.abs(newScore - oldScore) >= 20) {
            jobPromises.push(
              aiJobQueue.add(
                AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
                { 
                  subscriberIds, 
                  threadId: thread.id, 
                  threadName: thread.name,
                  oldScore,
                  newScore,
                  isOutdated,
                  cronJob: true
                },
                { jobId: `send-notifications-${thread.id}-${Date.now()}` }
              )
            );
          }

          return { resolutionScore: newScore };
        })()
      );

      // For conflict detection
      jobPromises.push(
        (async () => {
          const { aiService } = await import('@/lib/services/ai');
          const conflictResult = await aiService.detectConflicts(messages);
          
          if (conflictResult.hasConflict) {
            await prisma.section.update({
              where: { id: thread.id },
              data: { 
                isOutdated: true,
                lastVerifiedAt: new Date(),
              },
            });

            // If there are subscribers, add conflict notification job
            if (subscriberIds.length > 0) {
              jobPromises.push(
                aiJobQueue.add(
                  AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
                  { 
                    subscriberIds, 
                    threadId: thread.id, 
                    threadName: thread.name,
                    oldScore,
                    isOutdated: true,
                    conflictResult,
                    cronJob: true
                  },
                  { jobId: `send-notifications-${thread.id}-${Date.now()}` }
                )
              );
            }
          }

          return { conflictResult };
        })()
      );

      // Add daily digest job if there are subscribers
      if (subscriberIds.length > 0) {
        jobPromises.push(
          aiJobQueue.add(
            AIJobType.GENERATE_DAILY_DIGEST,
            { messages, subscriberIds, cronJob: true },
            { jobId: `generate-digest-${thread.id}-${Date.now()}` }
          )
        );
      }

      // Add outdated thread notification job
      if (subscriberIds.length > 0 && isOutdated) {
        jobPromises.push(
          aiJobQueue.add(
            AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
            { 
              subscriberIds, 
              threadId: thread.id, 
              threadName: thread.name,
              oldScore,
              isOutdated,
              cronJob: true
            },
            { jobId: `send-notifications-${thread.id}-${Date.now()}` }
          )
        );
      }
    }

    // Wait for all jobs to be added
    await Promise.all(jobPromises);

    // Update thread relations
    const relationsResult = await updateAllThreadRelations();

    // Pre-warm follow-up queries
    const prewarmResult = await prewarmFollowUpQueries();

    return NextResponse.json({
      success: true,
      results: {
        processed: threads.length,
        jobsAdded: jobPromises.length,
        relationsUpdated: relationsResult.updated,
        prewarmedQueries: prewarmResult.prewarmed,
      },
    });
  } catch (error) {
    console.error("Update threads cron error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
