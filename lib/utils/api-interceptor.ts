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
        // Global fetch interceptor runs outside React; Next.js router is unavailable here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login?reason=session_expired';
      }, SESSION_REDIRECT_DELAY_MS);
    }

    return fetchResponse;
  };

  interceptorAttached = true;
}
