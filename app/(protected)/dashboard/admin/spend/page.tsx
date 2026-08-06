'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Clock, Globe, Database, DollarSign } from 'lucide-react';

interface SpendTelemetry {
  today: {
    date: string;
    used: number;
    limit: number;
    remaining: number;
  };
  byOperation: Array<{
    operation: string;
    totalCostUsd: number;
    callCount: number;
    avgLatencyMs: number;
  }>;
  byProvider: Record<string, { costUsd: number; callCount: number }>;
  byModel: Record<string, { costUsd: number; callCount: number }>;
  periodTotal: {
    costUsd: number;
    callCount: number;
    successCount: number;
    failureCount: number;
  };
}

function formatUsd(cents: number): string {
  if (cents < 0.001) return '$0.0001';
  return `$${cents.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function SpendPage() {
  const [data, setData] = useState<SpendTelemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSpend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/spend');
      const json = await res.json();
      if (json.error) {
        setError(json.error.message || 'Failed to load spend data');
      } else {
        setData(json.data);
      }
    } catch {
      setError('Failed to connect to spend endpoint');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    fetchSpend();
    const interval = setInterval(fetchSpend, 60000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSpend]);

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
      <div className="page-heading flex items-center justify-between">
        <div>
          <p className="page-eyebrow"><DollarSign className="h-3.5 w-3.5" /> Admin</p>
          <h1>AI Spend Telemetry</h1>
          <p>Global AI cost telemetry, operation breakdown, and spend-cap status.</p>
        </div>
        <Button variant="outline" onClick={fetchSpend} disabled={loading} className="rounded-xl">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!data && !error && loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Today&apos;s Spend</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">Used</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(data.today.used)}</p>
                <p className="text-xs text-muted-foreground mt-1">of {formatUsd(data.today.limit)} limit</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className={`text-2xl font-bold mt-1 ${data.today.remaining < 1 ? 'text-red-600' : 'text-foreground'}`}>
                  {formatUsd(data.today.remaining)}
                </p>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      data.today.remaining < 1 ? 'bg-red-500' : data.today.remaining < data.today.limit * 0.3 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, (data.today.used / data.today.limit) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">Period Calls</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.periodTotal.callCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.periodTotal.successCount} succeeded, {data.periodTotal.failureCount} failed</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">Period Cost</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(data.periodTotal.costUsd)}</p>
                <p className="text-xs text-muted-foreground mt-1">7-day total</p>
              </div>
            </div>
          </section>

          {data.byOperation.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">By Operation</h2>
              <div className="rounded-xl border border-border bg-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-4 text-muted-foreground font-medium">Operation</th>
                      <th className="text-right p-4 text-muted-foreground font-medium">Calls</th>
                      <th className="text-right p-4 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right p-4 text-muted-foreground font-medium">Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byOperation.map((op) => (
                      <tr key={op.operation} className="border-b border-border/50">
                        <td className="p-4 text-foreground font-mono text-xs">{op.operation}</td>
                        <td className="p-4 text-right text-muted-foreground">{op.callCount}</td>
                        <td className="p-4 text-right text-foreground">{formatUsd(op.totalCostUsd)}</td>
                        <td className="p-4 text-right text-muted-foreground">{formatDuration(op.avgLatencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {Object.keys(data.byProvider).length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">By Provider</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(data.byProvider).map(([provider, stats]) => (
                  <div key={provider} className="rounded-xl border border-border bg-card p-6">
                    <p className="text-sm text-muted-foreground capitalize">{provider}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(stats.costUsd)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats.callCount} calls</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {Object.keys(data.byModel).length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">By Model</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(data.byModel).map(([model, stats]) => (
                  <div key={model} className="rounded-xl border border-border bg-card p-6">
                    <p className="text-sm text-muted-foreground">{model}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(stats.costUsd)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats.callCount} calls</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-xs text-muted-foreground text-right">
            Spending limit: {formatUsd(data.today.limit)}/day · Auto-refreshes every 60s
          </p>
        </>
      )}
    </div>
  );
}
