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
import type { UserActivity } from '@prisma/client';

export type BootstrapUser = {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
};

export type BootstrapData = {
  user: BootstrapUser;
  unreadNotificationCount: number;
  recentActivity: UserActivity[];
};

// Shell data excludes notification count — does NOT change on WS pushes.
export type BootstrapShellData = Omit<BootstrapData, 'unreadNotificationCount'>;

// ---------------------------------------------------------------------------
// Notification context — updates on every WS message.
// Only badge/count components should subscribe to this.
// ---------------------------------------------------------------------------
type NotificationContextValue = {
  unreadNotificationCount: number;
  setNotificationCount: (count: number) => void;
  incrementNotificationCount: (delta?: number) => void;
  decrementNotificationCount: (delta?: number) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Bootstrap context — user session, layout data, reputation.
// Does NOT update on WS notification events.
// ---------------------------------------------------------------------------
type BootstrapContextValue = {
  data: BootstrapShellData | null;
  isLoading: boolean;
  error: Error | null;
  setData: (data: BootstrapData) => void;
  updateUser: (user: Partial<BootstrapUser>) => void;
  invalidate: () => Promise<void>;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  // --- notification state ---
  const [unreadNotificationCount, setUnreadNotificationCountRaw] = useState(0);

  // --- shell state ---
  const [shellData, setShellData] = useState<BootstrapShellData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const router = useRouter();
  const mountedRef = useRef(true);

  const isPublicPage = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.startsWith('/login');
  }, []);

  const fetchBootstrap = useCallback(async () => {
    if (isPublicPage()) {
      setIsLoading(false);
      return;
    }

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
        // Strip notification count into its own state; store the rest in shell.
        const { unreadNotificationCount: _count, ...shell } = payload;
        setShellData(shell);
        setUnreadNotificationCountRaw(payload.unreadNotificationCount);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof TypeError && err.message === 'Failed to fetch') return;
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
  }, [router, isPublicPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchBootstrap();
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [fetchBootstrap]);

  // ---------------------------------------------------------------------------
  // Notification mutators (stable — no deps that change)
  // ---------------------------------------------------------------------------
  const setNotificationCount = useCallback((count: number) => {
    setUnreadNotificationCountRaw(Math.max(0, count));
  }, []);

  const incrementNotificationCount = useCallback((delta: number = 1) => {
    setUnreadNotificationCountRaw((prev) => Math.max(0, prev + delta));
  }, []);

  const decrementNotificationCount = useCallback((delta: number = 1) => {
    setUnreadNotificationCountRaw((prev) => Math.max(0, prev - delta));
  }, []);

  // ---------------------------------------------------------------------------
  // Shell mutators
  // ---------------------------------------------------------------------------
  const setData = useCallback((payload: BootstrapData) => {
    const { unreadNotificationCount: _count, ...shell } = payload;
    setShellData(shell);
    setUnreadNotificationCountRaw(payload.unreadNotificationCount);
  }, []);

  const updateUser = useCallback((user: Partial<BootstrapUser>) => {
    setShellData((prev) => (prev ? { ...prev, user: { ...prev.user, ...user } } : prev));
  }, []);

  const invalidate = useCallback(async () => {
    await fetchBootstrap();
  }, [fetchBootstrap]);

  // ---------------------------------------------------------------------------
  // Memoized context values — new object reference only when deps change
  // ---------------------------------------------------------------------------
  const notificationValue = useMemo(
    () => ({
      unreadNotificationCount,
      setNotificationCount,
      incrementNotificationCount,
      decrementNotificationCount,
    }),
    [
      unreadNotificationCount,
      setNotificationCount,
      incrementNotificationCount,
      decrementNotificationCount,
    ]
  );

  const bootstrapValue = useMemo(
    () => ({
      data: shellData,
      isLoading,
      error,
      setData,
      updateUser,
      invalidate,
    }),
    [shellData, isLoading, error, setData, updateUser, invalidate]
  );

  return (
    <NotificationContext.Provider value={notificationValue}>
      <BootstrapContext.Provider value={bootstrapValue}>{children}</BootstrapContext.Provider>
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Notification count + mutators. Updates on every WS message. */
export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within BootstrapProvider');
  }
  return ctx;
}

/** Bootstrap shell data (user). Does NOT update on WS messages. */
export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error('useBootstrap must be used within BootstrapProvider');
  }
  return ctx;
}
