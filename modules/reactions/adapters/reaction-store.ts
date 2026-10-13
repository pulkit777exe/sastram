import { prisma } from '@/lib/infrastructure/prisma';
import {
  addReaction as repoAddReaction,
  removeReaction as repoRemoveReaction,
  getUserReaction as repoGetUserReaction,
} from '../repository';
import type { ReactionStore } from '../ports/side-effects';

/** Prisma-backed store — the production adapter for `ReactionStore`. */
export const prismaReactionStore: ReactionStore = {
  async resolveThreadId(messageId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { threadId: true },
    });
    return message?.threadId ?? null;
  },
  async getReaction(messageId, userId, emoji) {
    const found = await repoGetUserReaction(messageId, userId, emoji);
    return found ? { messageId, userId, emoji } : null;
  },
  async addReaction(messageId, userId, emoji) {
    await repoAddReaction(messageId, userId, emoji);
  },
  async removeReaction(messageId, userId, emoji) {
    await repoRemoveReaction(messageId, userId, emoji);
  },
  async countByEmoji(messageId, emoji) {
    return prisma.reaction.count({ where: { messageId, emoji } });
  },
};

/** In-memory store for tests — no DB required. */
export function createFakeReactionStore(seed: { messageThreads?: Record<string, string>; reactions?: { messageId: string; userId: string; emoji: string }[] } = {}): ReactionStore & {
  reactions: { messageId: string; userId: string; emoji: string }[];
} {
  const threads = new Map(Object.entries(seed.messageThreads ?? {}));
  const reactions = [...(seed.reactions ?? [])];
  const key = (r: { messageId: string; userId: string; emoji: string }) => `${r.messageId}:${r.userId}:${r.emoji}`;
  return {
    reactions,
    async resolveThreadId(messageId) {
      return threads.get(messageId) ?? null;
    },
    async getReaction(messageId, userId, emoji) {
      return reactions.find((r) => r.messageId === messageId && r.userId === userId && r.emoji === emoji) ?? null;
    },
    async addReaction(messageId, userId, emoji) {
      if (!(await this.getReaction(messageId, userId, emoji))) reactions.push({ messageId, userId, emoji });
    },
    async removeReaction(messageId, userId, emoji) {
      const index = reactions.findIndex((r) => r.messageId === messageId && r.userId === userId && r.emoji === emoji);
      if (index >= 0) reactions.splice(index, 1);
    },
    async countByEmoji(messageId, emoji) {
      return reactions.filter((r) => r.messageId === messageId && r.emoji === emoji).length;
    },
  };
}
