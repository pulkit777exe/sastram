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

// Reconnection configuration
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

  // WebSocket reconnection state — refs so they don't trigger re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  // ── BOOTSTRAP FETCH ──────────────────────────────────────────────────────

  const fetchBootstrap = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bootstrap', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      // Session expired — redirect to login cleanly
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
        duration: Infinity, // stays until dismissed or page refreshes
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

  // ── WEBSOCKET WITH RECONNECTION ──────────────────────────────────────────

  const connectWebSocket = useCallback((userId: string) => {
    // Don't connect in SSR or if we've given up
    if (typeof window === 'undefined') return;
    if (!shouldReconnectRef.current) return;
    if (reconnectAttemptRef.current >= WS_MAX_ATTEMPTS) {
      // Silent failure after max attempts — non-critical feature
      // Notification count will be stale but app still works
      return;
    }

    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Pass userId as query param for server-side auth
    const url = `${protocol}://${window.location.host}/api/ws/notifications?userId=${userId}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      // WebSocket construction can throw if URL is invalid
      // Treat same as connection failure
      scheduleReconnect(userId);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      // Reset attempt counter on successful connection
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type: string;
          payload: { unreadCount: number };
        };
        if (message.type === 'NOTIFICATION_COUNT_UPDATE') {
          setNotificationCount(message.payload.unreadCount);
        }
      } catch {
        // Malformed message — ignore, don't crash
      }
    };

    ws.onerror = (event: Event) => {
      // ErrorEvent.message is often empty string in browsers
      // Log what we can — the onclose handler will fire next
      // and that's where we handle reconnection
      const wsEvent = event as ErrorEvent;
      if (process.env.NODE_ENV === 'development') {
        console.warn('[NotificationsWS] Connection error', {
          message: wsEvent.message || 'No error details available',
          readyState: ws.readyState,
          url: ws.url,
        });
      }
      // Do NOT toast here — onclose fires immediately after onerror
      // and we handle UX there to avoid double-messages
    };

    ws.onclose = (event: CloseEvent) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[NotificationsWS] Connection closed', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
        });
      }

      // Code 1000 = normal closure (we closed it intentionally)
      // Code 1001 = going away (page navigation)
      // Don't reconnect on intentional closes
      if (event.code === 1000 || event.code === 1001) return;
      if (!shouldReconnectRef.current) return;
      if (!mountedRef.current) return;

      scheduleReconnect(userId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(
    (userId: string) => {
      if (!mountedRef.current) return;
      if (!shouldReconnectRef.current) return;

      // Clear any existing timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectAttemptRef.current += 1;

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
      const delay = Math.min(
        WS_INITIAL_DELAY_MS * Math.pow(2, reconnectAttemptRef.current - 1),
        WS_MAX_DELAY_MS
      );

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current && shouldReconnectRef.current) {
          connectWebSocket(userId);
        }
      }, delay);
    },
    [connectWebSocket]
  );

  // Connect when we have a user ID from bootstrap
  useEffect(() => {
    if (!data?.user.id) return;

    shouldReconnectRef.current = true;
    connectWebSocket(data.user.id);

    return () => {
      // Cleanup on unmount — stop reconnecting and close
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

  // ── NOTIFICATION HELPERS ─────────────────────────────────────────────────

  const setNotificationCount = useCallback((count: number) => {
    setData((prev) => (prev ? { ...prev, unreadNotificationCount: Math.max(0, count) } : prev));
  }, []);

  const incrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            unreadNotificationCount: Math.max(0, prev.unreadNotificationCount + delta),
          }
        : prev
    );
  }, []);

  const decrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            unreadNotificationCount: Math.max(0, prev.unreadNotificationCount - delta),
          }
        : prev
    );
  }, []);

  // ── USER / REPUTATION HELPERS ────────────────────────────────────────────

  const updateUser = useCallback((user: Partial<BootstrapUser>) => {
    setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...user } } : prev));
  }, []);

  const updateReputation = useCallback((points: number, level: number) => {
    setData((prev) => (prev ? { ...prev, reputation: { points, level } } : prev));
  }, []);

  const invalidate = useCallback(async () => {
    await fetchBootstrap();
  }, [fetchBootstrap]);

  // ── CONTEXT VALUE ────────────────────────────────────────────────────────

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
