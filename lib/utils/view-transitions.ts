import { clientEnv } from '@/lib/config/env';

export function isViewTransitionsEnabled(): boolean {
  return clientEnv.NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED !== false;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return 'startViewTransition' in document;
}

export function shouldUseViewTransitions(): boolean {
  return isViewTransitionsEnabled() && supportsViewTransitions();
}
