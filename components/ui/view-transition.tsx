'use client';

import * as React from 'react';
import { useSyncExternalStore, type ReactNode } from 'react';
import {
  isViewTransitionsEnabled,
  supportsViewTransitions,
} from '@/lib/utils/view-transitions';

// React 19.3 exports ViewTransition as an internal element symbol. Access it
// through a typed narrowing because the stable TypeScript types do not expose it.
type ViewTransitionComponent = React.ComponentType<{ name?: string; children?: ReactNode } & Record<string, unknown>>;
function getViewTransition(): ViewTransitionComponent | undefined {
  return (React as unknown as { ViewTransition?: ViewTransitionComponent }).ViewTransition;
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