'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, RefreshCw, Wifi, Server, HardDrive, Users } from 'lucide-react';

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
  websocket: {
    totalConnections: number;
    connectedUsers: number;
    activeThreadRooms: number;
    activeTypingUsers: number;
  };
}

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/health');
      const json = await res.json();
      if (json.error) {
        setError(json.error.message || 'Failed to load health data');
      } else {
        setData(json.data);
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
        const res = await fetch('/api/admin/health');
        const json = await res.json();
        if (cancelled) return;
        if (json.error) {
          setError(json.error.message || 'Failed to load health data');
        } else {
          setData(json.data);
        }
      } catch {
        if (!cancelled) setError('Failed to connect to health endpoint');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    const interval = setInterval(doFetch, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
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
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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

            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Wifi className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  WS Connections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{data.websocket.totalConnections}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.websocket.connectedUsers} authenticated users
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Rooms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{data.websocket.activeThreadRooms}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.websocket.activeTypingUsers} typing now
                </p>
              </CardContent>
            </Card>
          </section>

          {/* WebSocket Detail */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                WebSocket Detail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-3">Metric</th>
                      <th className="pb-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { label: 'Total Connections', value: data.websocket.totalConnections },
                      { label: 'Authenticated Users', value: data.websocket.connectedUsers },
                      { label: 'Active Thread Rooms', value: data.websocket.activeThreadRooms },
                      { label: 'Users Typing Now', value: data.websocket.activeTypingUsers },
                    ].map((row) => (
                      <tr key={row.label} className="text-foreground">
                        <td className="py-3 text-muted-foreground">{row.label}</td>
                        <td className="py-3 text-right font-semibold">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            {' · '}Auto-refreshes every 30s
          </p>
        </>
      )}
    </div>
  );
}
