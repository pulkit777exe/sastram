'use client';

import type { QueryClient } from '@tanstack/react-query';
import { toasts } from '@/lib/utils/toast';

let interceptorAttached = false;
// Latches so a burst of parallel 401s produces one toast and one redirect.
let sessionExpiryHandled = false;

const HTTP_UNAUTHORIZED = 401;
const SESSION_REDIRECT_DELAY_MS = 1500;

export function attachApiInterceptor(queryClient: QueryClient) {
  if (typeof window === 'undefined') return;
  if (interceptorAttached) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...fetchArgs: Parameters<typeof fetch>) => {
    const fetchResponse = await originalFetch(...fetchArgs);

    const isUnauthorized = fetchResponse.status === HTTP_UNAUTHORIZED;
    const shouldHandleExpiry = isUnauthorized && !sessionExpiryHandled;
    if (shouldHandleExpiry) {
      sessionExpiryHandled = true;

      queryClient.clear();
      toasts.sessionExpired();

      window.setTimeout(() => {
        const loginUrl = new URL('/login?reason=session_expired', window.location.origin).toString();
        window.location.assign(loginUrl);
      }, SESSION_REDIRECT_DELAY_MS);
    }

    return fetchResponse;
  };

  interceptorAttached = true;
}
