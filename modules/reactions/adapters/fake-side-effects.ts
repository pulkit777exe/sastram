import type { ReactionSideEffectsPort } from '../ports/side-effects';

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
