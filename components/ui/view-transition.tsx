'use client';

import { ViewTransition } from 'react';
import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import {
  isViewTransitionsEnabled,
  supportsViewTransitions,
} from '@/lib/utils/view-transitions';

type VTProps = ComponentProps<typeof ViewTransition>;

type Props = Omit<VTProps, 'children'> & {
  children: ReactNode;
  fallback?: ReactNode;
};

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
  if (!enabled) return <>{fallback ?? children}</>;
  return <ViewTransition {...rest}>{children}</ViewTransition>;
}