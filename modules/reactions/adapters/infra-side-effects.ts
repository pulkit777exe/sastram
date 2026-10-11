import { recordActivity } from '@/modules/activity/repository';
import type { ReactionSideEffectsPort } from '../ports/side-effects';

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
