import { revalidatePath } from 'next/cache';
import { AIJobType } from '@/lib/queue/config';
import { enqueueJob } from '@/lib/services/queue';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { recordActivity } from '@/modules/activity/repository';
import { refreshUserExpertise } from '@/lib/services/user-memory';
import { ROUTES } from '@/lib/config/routes';
import type { ThreadSideEffectsPort } from '../ports/side-effects';

export const infraThreadSideEffects: ThreadSideEffectsPort = {
  async enqueueInitialAiJobs({ threadId, message }) {
    const messages = [message];
    try {
      await Promise.allSettled([
        enqueueJob(AIJobType.GENERATE_THREAD_DNA, { threadId, messages }),
        enqueueJob(AIJobType.CALCULATE_RESOLUTION_SCORE, { threadId, messages }),
      ]);
    } catch (error) {
      // Non-critical — the thread exists; AI enrichment can be retried later.
      logger.error('Failed to enqueue thread AI jobs:', error);
    }
  },

  revalidateThreadPage(slug) {
    if (slug) revalidatePath(ROUTES.THREAD(slug));
  },

  revalidateDashboard() {
    revalidatePath(ROUTES.DASHBOARD);
    revalidatePath(ROUTES.DASHBOARD_THREADS);
  },

  recordActivity(args) {
    return recordActivity({
      userId: args.userId,
      type: args.type,
      entityType: args.entityType,
      entityId: args.entityId,
      metadata: args.metadata,
    });
  },

  async slugExists(slug) {
    const found = await prisma.thread.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  },

  refreshExpertise(userId) {
    void refreshUserExpertise(userId).catch((err) =>
      logger.warn('[infraThreadSideEffects] refreshUserExpertise failed', { error: err })
    );
  },

  async copyThreadTags(sourceThreadId, destThreadId) {
    try {
      const sourceTags = await prisma.threadTagRelation.findMany({
        where: { threadId: sourceThreadId },
        select: { tagId: true },
      });
      if (sourceTags.length > 0) {
        await prisma.threadTagRelation.createMany({
          data: sourceTags.map((t) => ({ threadId: destThreadId, tagId: t.tagId })),
          skipDuplicates: true,
        });
      }
    } catch (error) {
      // best-effort, don't fail fork if tags copy fails
      logger.warn('[infraThreadSideEffects] copyThreadTags failed', { error });
    }
  },
};
