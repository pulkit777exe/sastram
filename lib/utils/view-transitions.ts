import { clientEnv } from '@/lib/config/env';

export function isViewTransitionsEnabled(): boolean {
  const viewTransitionsFlag = clientEnv.NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED;
  if (viewTransitionsFlag === false) return false;
  return true;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  const hasViewTransitionApi = 'startViewTransition' in document;
  return hasViewTransitionApi;
}

export function shouldUseViewTransitions(): boolean {
  const enabledByEnv = isViewTransitionsEnabled();
  const supportedByBrowser = supportsViewTransitions();
  if (!enabledByEnv) return false;
  if (!supportedByBrowser) return false;
  return true;
}
