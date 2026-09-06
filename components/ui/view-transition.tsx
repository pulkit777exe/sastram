'use client';

import * as React from 'react';
import { useSyncExternalStore, type ReactNode } from 'react';
import {
  isViewTransitionsEnabled,
  supportsViewTransitions,
} from '@/lib/utils/view-transitions';

// React 19 ViewTransition is canary — may be undefined in current build
// Single cast via unknown avoids eslint no-explicit-any while preserving runtime check
function getViewTransition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (React as any).ViewTransition as
    | React.ComponentType<{ name?: string; children?: ReactNode } & Record<string, unknown>>
    | undefined;
}
const ViewTransition = getViewTransition();

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
} & Record<string, unknown>;

function subscribe() {
  return () => {};
}
function getServerSnapshot() {
  return false;
}
function getClientSnapshot() {
  return isViewTransitionsEnabled() && supportsViewTransitions();
}

export function SaiViewTransition({ children, fallback, ...rest }: Props) {
  const enabled = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  if (!enabled || !ViewTransition) return <>{fallback ?? children}</>;
  return React.createElement(ViewTransition as React.ComponentType<Record<string, unknown>>, rest as Record<string, unknown>, children);
}