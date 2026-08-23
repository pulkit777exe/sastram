'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, TrendingUp, Clock, Globe, Database } from 'lucide-react';

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
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold text-foreground">AI Spend Telemetry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Global AI cost telemetry, operation breakdown, and spend-cap status.
          </p>
        </div>
        <button type="button" onClick={fetchSpend} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && (
        <Card className="rounded-3xl border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {!data && !error && loading && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-3xl">
              <CardContent className="p-6">
                <div className="skeleton h-4 w-24 mb-3" />
                <div className="skeleton h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Today's Spend */}
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Today&apos;s Spend
            </h2>
            <div className="grid gap-6 md:grid-cols-4">
              <Card className="rounded-3xl">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Used</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(data.today.used)}</p>
                  <p className="text-xs text-muted-foreground mt-1">of {formatUsd(data.today.limit)} limit</p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardContent className="p-6">
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
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Period Calls</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{data.periodTotal.callCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">{data.periodTotal.successCount} succeeded, {data.periodTotal.failureCount} failed</p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Period Cost</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(data.periodTotal.costUsd)}</p>
                  <p className="text-xs text-muted-foreground mt-1">7-day total</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* By Operation */}
          {data.byOperation.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Database className="w-5 h-5" />
                By Operation
              </h2>
              <Card className="rounded-3xl">
                <CardContent className="p-0">
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
                </CardContent>
              </Card>
            </section>
          )}

          {/* By Provider */}
          {Object.keys(data.byProvider).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                By Provider
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                {Object.entries(data.byProvider).map(([provider, stats]) => (
                  <Card key={provider} className="rounded-3xl">
                    <CardContent className="p-6">
                      <p className="text-sm text-muted-foreground capitalize">{provider}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(stats.costUsd)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stats.callCount} calls</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* By Model */}
          {Object.keys(data.byModel).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                By Model
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                {Object.entries(data.byModel).map(([model, stats]) => (
                  <Card key={model} className="rounded-3xl">
                    <CardContent className="p-6">
                      <p className="text-sm text-muted-foreground">{model}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{formatUsd(stats.costUsd)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stats.callCount} calls</p>
                    </CardContent>
                  </Card>
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