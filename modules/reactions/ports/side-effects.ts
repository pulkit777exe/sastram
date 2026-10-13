export interface ReactionRecord {
  messageId: string;
  userId: string;
  emoji: string;
}

export interface ReactionSideEffectsPort {
  recordActivity: (args: {
    userId: string;
    type: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
}

/**
 * Data seam behind reaction writes. The default implementation delegates to
 * the repository; tests inject an in-memory fake. Lets `toggleReactionCore`
 * run DB-free (auth resolution + toggle + count all behind the seam).
 */
export interface ReactionStore {
  resolveThreadId(messageId: string): Promise<string | null>;
  getReaction(messageId: string, userId: string, emoji: string): Promise<ReactionRecord | null>;
  addReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  countByEmoji(messageId: string, emoji: string): Promise<number>;
}

export interface ReactionDeps {
  sideEffects?: ReactionSideEffectsPort;
  store?: ReactionStore;
}
