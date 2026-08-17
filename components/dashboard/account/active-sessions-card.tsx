'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Monitor, Smartphone, LogOut } from 'lucide-react';
import { PressDepth } from '@/components/ui/button-press-depth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listSessionsAction, revokeSessionAction } from '@/modules/users/account-actions';

interface SessionItem {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  isCurrent?: boolean;
}

function parseUA(ua?: string | null) {
  if (!ua) return { icon: Monitor, label: 'Unknown device', browser: undefined };
  const isMobile = /mobile/i.test(ua);
  const match = ua.match(/(Chrome\/\S+|Firefox\/\S+|Safari\/\S+|Edge\/\S+|OPR\/\S+)/);
  const browser = match?.[0]?.replace(/\/.*/, '');
  const osMatch = ua.match(/\([^)]+\)/)?.[0];
  const os = osMatch?.replace(/[()]/g, '').split(';').map(s => s.trim()).filter(Boolean).find(s => !/\d/.test(s) && s.length > 2);
  return {
    icon: isMobile ? Smartphone : Monitor,
    label: isMobile ? 'Mobile' : 'Desktop',
    detail: [browser, os].filter(Boolean).join(' · '),
  };
}

export function ActiveSessionsCard({ currentToken }: { currentToken: string }) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listSessionsAction({}).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.error || !result.data) {
        toast.error('Failed to load sessions');
        return;
      }
      const items = (result.data.sessions as SessionItem[]).map((s) => ({
        ...s,
        isCurrent: s.token === currentToken,
      }));
      setSessions(items);
    });
    return () => {
      active = false;
    };
  }, [currentToken]);

  async function handleRevoke(token: string) {
    setRevoking(token);
    try {
      const result = await revokeSessionAction({ token });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.token !== token));
      toast.success('Session revoked');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Devices and browsers currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          sessions.map((session) => {
            const { icon: Icon, label, detail } = parseUA(session.userAgent);
            return (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {label}
                      {session.isCurrent && (
                        <span className="ml-2 text-xs text-emerald-500">This device</span>
                      )}
                    </p>
                    {detail && (
                      <p className="text-xs text-muted-foreground truncate">{detail}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress ? `IP ${session.ipAddress} · ` : ''}
                      Signed in {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <PressDepth
                    disabled={revoking === session.token}
                    onClick={() => handleRevoke(session.token)}
                  >
                    <LogOut className="mr-1 h-3 w-3" />
                    {revoking === session.token ? 'Revoking…' : 'Revoke'}
                  </PressDepth>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
