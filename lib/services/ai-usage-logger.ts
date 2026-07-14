import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';

const COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  'gemini-flash': { input: 0.075, output: 0.30 },
  'gemini-pro': { input: 1.25, output: 5.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1M_TOKENS[model] ?? { input: 0.075, output: 0.30 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
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

export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    const costUsd = estimateCost(params.model, params.inputTokens, params.outputTokens);
    await prisma.aiUsageLog.create({
      data: {
        userId: params.userId,
        operation: params.operation,
        provider: params.provider,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        latencyMs: params.latencyMs,
        costUsd,
        success: params.success ?? true,
        errorMessage: params.errorMessage,
      },
    });
  } catch (error) {
    logger.error('[ai-usage-logger] Failed to log AI usage', error);
  }
}
