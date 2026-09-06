import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

const MODEL_PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'gemini-flash': { input: 0.075, output: 0.30 },
  'gemini-pro': { input: 1.25, output: 5.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
};

const DEFAULT_MODEL_RATES = MODEL_PRICING_PER_MILLION_TOKENS['gemini-flash'];
const TOKENS_PER_MILLION = 1_000_000;

function estimateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  let pricing = MODEL_PRICING_PER_MILLION_TOKENS[modelName];
  if (pricing === undefined) {
    pricing = DEFAULT_MODEL_RATES;
  }
  return (inputTokens * pricing.input + outputTokens * pricing.output) / TOKENS_PER_MILLION;
}

export interface LogAiUsageParams {
  userId?: string;
  operation: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success?: boolean;
  errorMessage?: string;
}

/** Never throws — accounting must not break the AI call it's measuring. */
export async function logAiUsage(usageParams: LogAiUsageParams): Promise<void> {
  try {
    let successValue = usageParams.success;
    if (successValue === undefined) {
      successValue = true;
    }
    await prisma.aiUsageLog.create({
      data: {
        ...usageParams,
        costUsd: estimateCost(usageParams.model, usageParams.inputTokens, usageParams.outputTokens),
        success: successValue,
      },
    });
  } catch (logError) {
    logger.error('[ai-usage-logger] Failed to log AI usage', logError);
  }
}
