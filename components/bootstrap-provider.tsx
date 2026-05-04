'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Community, UserActivity } from '@prisma/client';

export type BootstrapUser = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  reputationPoints: number;
  isPro: boolean;
};

export type BootstrapData = {
  user: BootstrapUser;
  unreadNotificationCount: number;
  recentActivity: UserActivity[];
  reputation: { points: number; level: number };
  joinedCommunities: Community[];
};

type BootstrapContextValue = {
  data: BootstrapData | null;
  isLoading: boolean;
  error: Error | null;
  setData: (data: BootstrapData) => void;
  setNotificationCount: (count: number) => void;
  incrementNotificationCount: (delta?: number) => void;
  decrementNotificationCount: (delta?: number) => void;
  updateUser: (user: Partial<BootstrapUser>) => void;
  updateReputation: (points: number, level: number) => void;
  invalidate: () => Promise<void>;
};

const WS_INITIAL_DELAY_MS = 1_000;
const WS_MAX_DELAY_MS = 30_000;
const WS_MAX_ATTEMPTS = 10;

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const router = useRouter();
  const mountedRef = useRef(true);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  const fetchBootstrap = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bootstrap', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.status === 401) {
        router.replace('/login?reason=session_expired');
        return;
      }

      if (!res.ok) {
        throw new Error(`Bootstrap failed with status ${res.status}`);
      }

      const payload = (await res.json()) as BootstrapData;

      if (mountedRef.current) {
        setData(payload);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const error = err instanceof Error ? err : new Error('Failed to load app data');
      setError(error);
      toast.error('Failed to load your data.', {
        description: 'Please refresh the page to try again.',
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload(),
        },
        duration: Infinity,
      });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    fetchBootstrap();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchBootstrap]);

  const connectWebSocket = useCallback(
    (userId: string) => {
      if (typeof window === 'undefined') return;
      if (!shouldReconnectRef.current) return;
      if (reconnectAttemptRef.current >= WS_MAX_ATTEMPTS) {
        return;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${window.location.host}/api/ws/notifications?userId=${userId}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as {
            type: string;
            payload: { unreadCount: number };
          };
          if (message.type === 'NOTIFICATION_COUNT_UPDATE') {
            setData((prev) =>
              prev ? { ...prev, unreadNotificationCount: message.payload.unreadCount } : prev
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // handled in onclose
      };

      ws.onclose = (event: CloseEvent) => {
        if (event.code === 1000 || event.code === 1001) return;
        if (!shouldReconnectRef.current) return;
        if (!mountedRef.current) return;

        reconnectAttemptRef.current += 1;
        const delay = Math.min(
          WS_INITIAL_DELAY_MS * Math.pow(2, reconnectAttemptRef.current - 1),
          WS_MAX_DELAY_MS
        );

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && shouldReconnectRef.current) {
            connectWebSocket(userId);
          }
        }, delay);
      };
    },
    []
  );

  useEffect(() => {
    if (!data?.user.id) return;

    shouldReconnectRef.current = true;
    connectWebSocket(data.user.id);

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [data?.user.id, connectWebSocket]);

  const setNotificationCount = useCallback((count: number) => {
    setData((prev) => (prev ? { ...prev, unreadNotificationCount: Math.max(0, count) } : prev));
  }, []);

  const incrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? { ...prev, unreadNotificationCount: Math.max(0, prev.unreadNotificationCount + delta) }
        : prev
    );
  }, []);

  const decrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? { ...prev, unreadNotificationCount: Math.max(0, prev.unreadNotificationCount - delta) }
        : prev
    );
  }, []);

  const updateUser = useCallback((user: Partial<BootstrapUser>) => {
    setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...user } } : prev));
  }, []);

  const updateReputation = useCallback((points: number, level: number) => {
    setData((prev) => (prev ? { ...prev, reputation: { points, level } } : prev));
  }, []);

  const invalidate = useCallback(async () => {
    await fetchBootstrap();
  }, [fetchBootstrap]);

  const value = useMemo(
    () => ({
      data,
      isLoading,
      error,
      setData,
      setNotificationCount,
      incrementNotificationCount,
      decrementNotificationCount,
      updateUser,
      updateReputation,
      invalidate,
    }),
    [
      data,
      isLoading,
      error,
      setNotificationCount,
      incrementNotificationCount,
      decrementNotificationCount,
      updateUser,
      updateReputation,
      invalidate,
    ]
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error('useBootstrap must be used within BootstrapProvider');
  }
  return ctx;
}