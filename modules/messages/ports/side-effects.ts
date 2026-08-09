// Injected into message actions so tests can assert on emails/jobs without
// touching SMTP or QStash. See adapters/infra-side-effects.ts for the real one.
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
}
