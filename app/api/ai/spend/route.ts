import { NextRequest, NextResponse } from 'next/server';
import { ok, withErrorHandling } from '@/lib/utils/api-response';
import { requireAdmin } from '@/lib/middleware/moderation';
import { getAiSpendUsage } from '@/lib/services/ai-spend-cap';
import { prisma } from '@/lib/infrastructure/prisma';

interface DailySpend {
  date: string;
  used: number;
  limit: number;
  remaining: number;
}

interface OperationSpend {
  operation: string;
  totalCostUsd: number;
  callCount: number;
  avgLatencyMs: number;
}

interface SpendTelemetry {
  today: DailySpend;
  byOperation: OperationSpend[];
  byProvider: Record<string, { costUsd: number; callCount: number }>;
  byModel: Record<string, { costUsd: number; callCount: number }>;
  periodTotal: { costUsd: number; callCount: number; successCount: number; failureCount: number };
}

async function getOperationSpend(fromDate: string, toDate: string): Promise<OperationSpend[]> {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ['operation'],
    where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) } },
    _sum: { costUsd: true },
    _count: { id: true },
    _avg: { latencyMs: true },
    orderBy: { _sum: { costUsd: 'desc' } },
  });

  return rows.map((r) => ({
    operation: r.operation,
    totalCostUsd: Number(r._sum.costUsd ?? 0),
    callCount: r._count.id,
    avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
  }));
}

async function getByProvider(fromDate: string, toDate: string) {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ['provider'],
    where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) } },
    _sum: { costUsd: true },
    _count: { id: true },
  });

  const result: Record<string, { costUsd: number; callCount: number }> = {};
  for (const r of rows) {
    result[r.provider] = {
      costUsd: Number(r._sum.costUsd ?? 0),
      callCount: r._count.id,
    };
  }
  return result;
}

async function getByModel(fromDate: string, toDate: string) {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ['model'],
    where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) } },
    _sum: { costUsd: true },
    _count: { id: true },
  });

  const result: Record<string, { costUsd: number; callCount: number }> = {};
  for (const r of rows) {
    result[r.model] = {
      costUsd: Number(r._sum.costUsd ?? 0),
      callCount: r._count.id,
    };
  }
  return result;
}

async function getPeriodTotal(fromDate: string, toDate: string) {
  const [costSum, totalCount, successCount, failureCount] = await Promise.all([
    prisma.aiUsageLog.aggregate({ where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) } }, _sum: { costUsd: true } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) } } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) }, success: true } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: new Date(fromDate), lt: new Date(toDate) }, success: false } }),
  ]);

  return {
    costUsd: Number(costSum._sum.costUsd ?? 0),
    callCount: totalCount,
    successCount,
    failureCount,
  };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireAdmin();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const todaySpend = await getAiSpendUsage();

  const [weekAgg, byOp, byProv, byModel, periodTotal] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: new Date(weekAgo), lt: now } },
      _sum: { costUsd: true },
      _count: { id: true },
    }),
    getOperationSpend(weekAgo, today),
    getByProvider(weekAgo, today),
    getByModel(weekAgo, today),
    getPeriodTotal(weekAgo, today),
  ]);

  const response: SpendTelemetry = {
    today: {
      date: todaySpend.date,
      used: todaySpend.used,
      limit: todaySpend.limit,
      remaining: Math.max(0, todaySpend.limit - todaySpend.used),
    },
    byOperation: byOp,
    byProvider: byProv,
    byModel: byModel,
    periodTotal: {
      costUsd: periodTotal.costUsd,
      callCount: periodTotal.callCount,
      successCount: periodTotal.successCount,
      failureCount: periodTotal.failureCount,
    },
  };

  return NextResponse.json(ok(response));
});
