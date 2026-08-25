'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Server, HardDrive, AlertTriangle, Clock } from 'lucide-react';

interface HealthData {
  timestamp: string;
  version: string;
  uptime: number;
  uptimeHuman: string;
  memory: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
  };
}

interface SlaData {
  totalPending: number;
  pendingOver24h: number;
  pendingOver72h: number;
  avgResponseTimeHours: number | null;
}

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [slaData, setSlaData] = useState<SlaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, slaRes] = await Promise.all([
        fetch('/api/admin/health'),
        fetch('/api/admin/sla'),
      ]);
      const healthJson = await healthRes.json();
      const slaJson = await slaRes.json();
      if (healthJson.error) {
        setError(healthJson.error.message || 'Failed to load health data');
      } else {
        setData(healthJson.data);
      }
      if (!slaJson.error) {
        setSlaData(slaJson.data);
      }
    } catch {
      setError('Failed to connect to health endpoint');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const [healthRes, slaRes] = await Promise.all([
          fetch('/api/admin/health'),
          fetch('/api/admin/sla'),
        ]);
        const healthJson = await healthRes.json();
        const slaJson = await slaRes.json();
        if (cancelled) return;
        if (healthJson.error) {
          setError(healthJson.error.message || 'Failed to load health data');
        } else {
          setData(healthJson.data);
        }
        if (!slaJson.error) {
          setSlaData(slaJson.data);
        }
      } catch {
        if (!cancelled) setError('Failed to connect to health endpoint');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();

    let interval = setInterval(doFetch, 30000);

    // Pause polling when tab is hidden to save resources
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        doFetch(); // immediate refresh on foreground
        interval = setInterval(doFetch, 30000);
      } else {
        clearInterval(interval);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-3">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">System Health</h1>
          <p className="mt-1 text-sm text-ink-3">
            Real-time metrics for the Sastram server instance.
          </p>
        </div>
        <Button variant="outline" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {error && (
        <Card className="rounded-3xl border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {!data && !error && loading && (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
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
          {/* System Info */}
          <section className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Server className="w-5 h-5 text-ink-3" />
                <CardTitle className="text-sm font-medium text-ink-3">
                  Uptime
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-ink">{data.uptimeHuman}</p>
                <p className="text-xs text-ink-3 mt-1">v{data.version}</p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <HardDrive className="w-5 h-5 text-ink-3" />
                <CardTitle className="text-sm font-medium text-ink-3">
                  Memory (RSS)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-ink">{data.memory.rss}</p>
                <p className="text-xs text-ink-3 mt-1">
                  Heap: {data.memory.heapUsed} / {data.memory.heapTotal}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Moderation SLA */}
          {slaData && (
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Moderation SLA
              </h2>
              <div className="grid gap-6 md:grid-cols-4">
                <Card className="rounded-3xl">
                  <CardContent className="p-6">
                    <p className="text-sm text-ink-3">Total Pending</p>
                    <p className="text-2xl font-bold text-ink mt-1">{slaData.totalPending}</p>
                  </CardContent>
                </Card>
                <Card className={`rounded-3xl ${slaData.pendingOver24h > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}`}>
                  <CardContent className="p-6">
                    <p className="text-sm text-ink-3 flex items-center gap-1">
                      {slaData.pendingOver24h > 0 && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                      Pending &gt; 24h
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${slaData.pendingOver24h > 0 ? 'text-yellow-700' : 'text-ink'}`}>
                      {slaData.pendingOver24h}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`rounded-3xl ${slaData.pendingOver72h > 0 ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                  <CardContent className="p-6">
                    <p className="text-sm text-ink-3 flex items-center gap-1">
                      {slaData.pendingOver72h > 0 && <AlertTriangle className="w-4 h-4 text-red-600" />}
                      Pending &gt; 72h
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${slaData.pendingOver72h > 0 ? 'text-red-700' : 'text-ink'}`}>
                      {slaData.pendingOver72h}
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl">
                  <CardContent className="p-6">
                    <p className="text-sm text-ink-3">Avg Response Time</p>
                    <p className="text-2xl font-bold text-ink mt-1">
                      {slaData.avgResponseTimeHours !== null ? `${slaData.avgResponseTimeHours}h` : 'N/A'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          <p className="text-xs text-ink-3 text-right">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            {' · '}Auto-refreshes every 30s
          </p>
        </>
      )}
    </div>
  );
}
