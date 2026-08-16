import { consumeAiInlineQuota } from '@/lib/ai/daily-quota';
import { enforceAiSpendCap } from '@/lib/ai/spend-cap';
import { AiCallPath, evaluateAiCostGate } from '@/lib/ai/cost-classification';
import type { MessageSideEffectsPort } from '@/modules/messages/ports/side-effects';

type AiInlineQuota = (params: {
  userId: string;
  threadId: string;
}) => Promise<{ allowed: boolean; used: number }>;

type AiSpendCapCheck = () => Promise<{ allowed: boolean; remaining: number; used: number }>;

const NOT_REQUESTED = {
  aiInlineQueued: false,
  aiInlineLimited: false,
  aiInlineStreaming: false,
} as const;

const LIMITED = { aiInlineQueued: false, aiInlineLimited: true, aiInlineStreaming: false } as const;

export function extractAiInlineQuery(content: string): string | null {
  const query = content.match(/(?:^|\s)@sai\s+(.+)/i)?.[1]?.trim();
  return query || null;
}

export async function queueAiInlineIfRequested(args: {
  content: string;
  userId: string;
  threadId: string;
  messageId: string;
  sideEffects: MessageSideEffectsPort;
  // The browser opens the SSE stream itself, so skip the background job to
  // avoid generating the reply twice. Quota/cost gates still apply here.
  clientStreams?: boolean;
  quotaCheck?: AiInlineQuota;
  spendCapCheck?: AiSpendCapCheck;
}): Promise<{ aiInlineQueued: boolean; aiInlineLimited: boolean; aiInlineStreaming: boolean }> {
  const aiQuery = extractAiInlineQuery(args.content);
  if (!aiQuery) return { ...NOT_REQUESTED };

  const quota = await (args.quotaCheck ?? consumeAiInlineQuota)({
    userId: args.userId,
    threadId: args.threadId,
  });
  if (!quota.allowed) return { ...LIMITED };

  // @sai is an expensive synthesis, so pre-flight the global spend cap rather
  // than discovering it at worker time. checkAiSpendCap fails OPEN when Redis
  // is down — deliberate: availability beats a perfectly enforced budget.
  const spendCap = await (args.spendCapCheck ?? (() => enforceAiSpendCap(AiCallPath.AI_INLINE_REPLY)))();
  const gate = evaluateAiCostGate({
    path: AiCallPath.AI_INLINE_REPLY,
    spendCapAllowed: spendCap.allowed,
  });
  if (!gate.allowed) return { ...LIMITED };

  if (args.clientStreams) {
    return { aiInlineQueued: false, aiInlineLimited: false, aiInlineStreaming: true };
  }

  await args.sideEffects.enqueueAiInline({
    messageId: args.messageId,
    threadId: args.threadId,
    query: aiQuery,
    userId: args.userId,
  });

  return { aiInlineQueued: true, aiInlineLimited: false, aiInlineStreaming: false };
}
