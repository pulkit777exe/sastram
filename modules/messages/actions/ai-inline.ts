import { consumeAiInlineQuota } from '@/lib/services/ai-inline-rate-limit';
import { checkAiSpendCap } from '@/lib/services/ai-spend-cap';
import { AiCallPath, evaluateAiCostGate } from '@/lib/services/ai-cost-classification';
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

  // Hard cost-aware gate: @sai inline is an EXPENSIVE synthesis. Pre-flight the
  // global spend cap so we don't enqueue unaffordable work that would burn the
  // LLM. checkAiSpendCap fails OPEN (Redis down) — for an expensive path that
  // means we still enqueue, matching the existing best-effort tradeoff, but when
  // Redis is healthy an exhausted cap is a hard stop here rather than at worker time.
  const spendCap = await checkAiSpendCap();
  const gate = evaluateAiCostGate({
    path: AiCallPath.AI_INLINE_REPLY,
    spendCapAllowed: spendCap.allowed,
  });

  if (!gate.allowed) {
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
