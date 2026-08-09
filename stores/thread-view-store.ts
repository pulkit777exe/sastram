'use client';

import { useSyncExternalStore } from 'react';

type ThreadViewState = {
  selectedThreadSlug: string | null;
};

type ThreadViewSnapshot = ThreadViewState & {
  selectThread: (slug: string) => void;
};

const listeners = new Set<() => void>();

let state: ThreadViewState = {
  selectedThreadSlug: null,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function selectThread(slug: string) {
  state = { ...state, selectedThreadSlug: slug };
  listeners.forEach((listener) => listener());
}

export function useThreadViewStore<T>(selector: (state: ThreadViewSnapshot) => T) {
  const snapshot = () => selector({ ...state, selectThread });
  // Server snapshot is the same: this store starts empty and is only ever
  // written from client interactions.
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
