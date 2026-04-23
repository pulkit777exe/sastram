import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import {
  AIJobType,
  DEFAULT_JOB_OPTIONS,
  getAiInsightNotificationsQueue,
  getConflictDetectionQueue,
  getDailyDigestQueue,
  getResolutionScoreQueue,
  getThreadDnaQueue,
} from '@/lib/infrastructure/bullmq';
import { updateAllThreadRelations } from '@/modules/threads/relations';
import { prewarmFollowUpQueries } from '@/modules/ai-search/query-warming';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || '50', 10),
          orderBy: { createdAt: 'desc' },
          include: { sender: true },
        },
        subscriptions: true,
      },
    });

    const jobPromises = [];
    const threadDnaQueue = getThreadDnaQueue();
    const resolutionScoreQueue = getResolutionScoreQueue();
    const conflictDetectionQueue = getConflictDetectionQueue();
    const dailyDigestQueue = getDailyDigestQueue();
    const aiInsightNotificationsQueue = getAiInsightNotificationsQueue();

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
        threadDnaQueue.add(
          AIJobType.GENERATE_THREAD_DNA,
          { threadId: thread.id, messages, cronJob: true },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId: `generate-dna-${thread.id}-${Date.now()}`,
          }
        )
      );

      const oldScore = thread.resolutionScore;
      jobPromises.push(
        resolutionScoreQueue.add(
          AIJobType.CALCULATE_RESOLUTION_SCORE,
          {
            threadId: thread.id,
            messages,
            subscriberIds,
            threadName: thread.name,
            oldScore,
            isOutdated,
            cronJob: true,
          },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId: `resolution-score-${thread.id}-${Date.now()}`,
          }
        )
      );

      jobPromises.push(
        conflictDetectionQueue.add(
          AIJobType.DETECT_CONFLICTS,
          {
            threadId: thread.id,
            messages,
            subscriberIds,
            threadName: thread.name,
            oldScore,
            cronJob: true,
          },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId: `conflict-detection-${thread.id}-${Date.now()}`,
          }
        )
      );

      if (subscriberIds.length > 0) {
        jobPromises.push(
          dailyDigestQueue.add(
            AIJobType.GENERATE_DAILY_DIGEST,
            { messages, subscriberIds, cronJob: true },
            {
              ...DEFAULT_JOB_OPTIONS,
              jobId: `generate-digest-${thread.id}-${Date.now()}`,
            }
          )
        );
      }

      if (subscriberIds.length > 0 && isOutdated) {
        jobPromises.push(
          aiInsightNotificationsQueue.add(
            AIJobType.SEND_AI_INSIGHT_NOTIFICATIONS,
            {
              subscriberIds,
              threadId: thread.id,
              threadName: thread.name,
              oldScore: oldScore ?? undefined,
              isOutdated,
              cronJob: true,
            },
            {
              ...DEFAULT_JOB_OPTIONS,
              jobId: `send-notifications-${thread.id}-${Date.now()}`,
            }
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
    console.error('Update threads cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
