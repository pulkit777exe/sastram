export interface ReactionSideEffectsPort {
  recordActivity: (args: {
    userId: string;
    type: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}
