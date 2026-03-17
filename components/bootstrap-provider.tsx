"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Community, UserActivity } from "@prisma/client";

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

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchBootstrap = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bootstrap", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch bootstrap data: ${res.status}`);
      }
      const payload = (await res.json()) as BootstrapData;
      if (mountedRef.current) {
        setData(payload);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchBootstrap]);

  const setNotificationCount = useCallback((count: number) => {
    setData((prev) =>
      prev
        ? { ...prev, unreadNotificationCount: Math.max(0, count) }
        : prev,
    );
  }, []);

  // Connect to user notifications WebSocket
  useEffect(() => {
    if (typeof window === "undefined" || !data?.user.id) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/notifications`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Notifications WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "NOTIFICATION_COUNT_UPDATE") {
          setNotificationCount(message.payload.unreadCount);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("Notifications WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Notifications WebSocket closed");
    };

    return () => {
      ws.close();
    };
  }, [data?.user.id, setNotificationCount]);

  const incrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            unreadNotificationCount: Math.max(
              0,
              prev.unreadNotificationCount + delta,
            ),
          }
        : prev,
    );
  }, []);

  const decrementNotificationCount = useCallback((delta: number = 1) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            unreadNotificationCount: Math.max(
              0,
              prev.unreadNotificationCount - delta,
            ),
          }
        : prev,
    );
  }, []);

  const updateUser = useCallback((user: Partial<BootstrapUser>) => {
    setData((prev) => (prev ? { ...prev, user: { ...prev.user, ...user } } : prev));
  }, []);

  const updateReputation = useCallback((points: number, level: number) => {
    setData((prev) =>
      prev ? { ...prev, reputation: { points, level } } : prev,
    );
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
      setData,
      setNotificationCount,
      incrementNotificationCount,
      decrementNotificationCount,
      updateUser,
      updateReputation,
      invalidate,
    ],
  );

  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error("useBootstrap must be used within BootstrapProvider");
  }
  return ctx;
}
