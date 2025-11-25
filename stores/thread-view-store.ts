"use client";

import { useSyncExternalStore } from "react";

type ThreadViewState = {
  selectedThreadSlug: string | null;
};

type ThreadViewActions = {
  selectThread: (slug: string) => void;
};

const listeners = new Set<() => void>();
let state: ThreadViewState = {
  selectedThreadSlug: null,
};

function setState(partial: Partial<ThreadViewState>) {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getState() {
  return state;
}

export function useThreadViewStore<T>(
  selector: (state: ThreadViewState & ThreadViewActions) => T,
) {
  return useSyncExternalStore(
    subscribe,
    () => selector({ ...getState(), selectThread }),
    () => selector({ ...getState(), selectThread }),
  );
}

export function selectThread(slug: string) {
  setState({ selectedThreadSlug: slug });
}

