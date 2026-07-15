import { consumeAiInlineQuota } from '@/lib/services/ai-inline-rate-limit';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

export function extractAiInlineQuery(content: string): string | null {
  const match = content.match(/(?:^|\s)@sai\s+(.+)/i);
  if (!match || !match[1]) {
    return null;
  }

  const query = match[1].trim();
  return query.length > 0 ? query : null;
}

export async function queueAiInlineIfRequested(args: {
  content: string;
  userId: string;
  threadId: string;
  messageId: string;
  sideEffects: MessageSideEffectsPort;
}): Promise<{ aiInlineQueued: boolean; aiInlineLimited: boolean }> {
  const aiQuery = extractAiInlineQuery(args.content);

  if (!aiQuery) {
    return { aiInlineQueued: false, aiInlineLimited: false };
  }

  const quota = await consumeAiInlineQuota({
    userId: args.userId,
    threadId: args.threadId,
  });

  if (!quota.allowed) {
    return { aiInlineQueued: false, aiInlineLimited: true };
  }

  await args.sideEffects.enqueueAiInline({
    messageId: args.messageId,
    threadId: args.threadId,
    query: aiQuery,
    userId: args.userId,
  });

  return { aiInlineQueued: true, aiInlineLimited: false };
}
