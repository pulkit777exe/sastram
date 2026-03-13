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
  const mountedRef = useRef(true);

  const fetchBootstrap = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/bootstrap", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setIsLoading(false);
        return;
      }
      const payload = (await res.json()) as BootstrapData;
      if (mountedRef.current) {
        setData(payload);
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
