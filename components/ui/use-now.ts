'use client';

import { useSyncExternalStore } from 'react';

// One tab-wide "now" ticker (30s). Replaces the per-instance setInterval storm:
// every TimeAgo on a 50-message thread plus the poll-expiry and resolution
// clocks each owned a timer; now they all subscribe to this single interval.
// The timer starts on first subscribe and stops on last unsubscribe, so idle
// pages and background navigations hold zero timers.
const TICK_MS = 30_000;

let current: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onTick: () => void): () => void {
  listeners.add(onTick);
  if (timer === null && typeof window !== 'undefined') {
    if (current === null) current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const listener of listeners) listener();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (current === null) current = Date.now();
  return current;
}

function getServerSnapshot(): number {
  return 0;
}

/** Milliseconds since epoch, refreshing every 30s from a single shared timer. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
