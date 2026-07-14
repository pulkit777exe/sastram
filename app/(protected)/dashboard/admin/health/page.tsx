'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold text-foreground">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time metrics for the Sastram server instance.
          </p>
        </div>
        <Button variant="outline" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {error && (
        <Card className="rounded-3xl border-red-200 bg-red-50">
          <CardContent className="p-6 text-red-700 text-sm">{error}</CardContent>
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
                <Server className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Uptime
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{data.uptimeHuman}</p>
                <p className="text-xs text-muted-foreground mt-1">v{data.version}</p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <HardDrive className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Memory (RSS)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{data.memory.rss}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Heap: {data.memory.heapUsed} / {data.memory.heapTotal}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Moderation SLA */}
          {slaData && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Moderation SLA
              </h2>
              <div className="grid gap-6 md:grid-cols-4">
                <Card className="rounded-3xl">
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground">Total Pending</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{slaData.totalPending}</p>
                  </CardContent>
                </Card>
                <Card className={`rounded-3xl ${slaData.pendingOver24h > 0 ? 'border-yellow-200 bg-yellow-50' : ''}`}>
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      {slaData.pendingOver24h > 0 && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                      Pending &gt; 24h
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${slaData.pendingOver24h > 0 ? 'text-yellow-700' : 'text-foreground'}`}>
                      {slaData.pendingOver24h}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`rounded-3xl ${slaData.pendingOver72h > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      {slaData.pendingOver72h > 0 && <AlertTriangle className="w-4 h-4 text-red-600" />}
                      Pending &gt; 72h
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${slaData.pendingOver72h > 0 ? 'text-red-700' : 'text-foreground'}`}>
                      {slaData.pendingOver72h}
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-3xl">
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {slaData.avgResponseTimeHours !== null ? `${slaData.avgResponseTimeHours}h` : 'N/A'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            {' · '}Auto-refreshes every 30s
          </p>
        </>
      )}
    </div>
  );
}
