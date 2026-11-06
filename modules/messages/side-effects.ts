// Injected into message actions so tests can assert on side effects without
// touching SMTP, QStash, Redis, or Next.js cache. See adapters/infra-side-effects.ts
// for the real one.
export interface MessageSideEffectsPort {
  sendMentionEmail: (args: {
    toEmail: string;
    mentionedByName: string;
    threadName: string;
    contentPreview: string;
    threadUrl: string;
  }) => Promise<void>;
  enqueueAiInline: (args: {
    messageId: string;
    threadId: string;
    query: string;
    userId: string;
  }) => Promise<void>;
  createBulkNotifications: (notifications: Array<{
    userId: string;
    type: 'MENTION' | 'SYSTEM';
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }>) => Promise<void>;
  recordActivity: (args: {
    userId: string;
    type: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  revalidateThreadPage: (slug: string | null) => void;
  revalidateDashboard: () => void;
}
