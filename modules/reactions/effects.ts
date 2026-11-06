import { recordActivity } from '@/modules/activity/repository';
import type { ReactionSideEffectsPort } from './store';

export const infraReactionSideEffects: ReactionSideEffectsPort = {
  recordActivity(args) {
    return recordActivity({
      userId: args.userId,
      type: args.type,
      entityType: args.entityType,
      entityId: args.entityId,
      metadata: args.metadata,
    });
  },
};

export function createFakeReactionSideEffects(): ReactionSideEffectsPort & {
  activities: Array<{ userId: string; type: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }>;
} {
  const activities: Array<{ userId: string; type: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }> = [];
  return {
    activities,
    async recordActivity(args) {
      activities.push(args);
      return { id: `fake-reaction-activity-${activities.length}` };
    },
  };
}
