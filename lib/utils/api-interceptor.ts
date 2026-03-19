"use client";

import type { QueryClient } from "@tanstack/react-query";
import { toasts } from "@/lib/utils/toast";

let interceptorAttached = false;
let sessionExpiryHandled = false;

export function attachApiInterceptor(queryClient: QueryClient) {
  if (typeof window === "undefined" || interceptorAttached) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);

    if (response.status === 401 && !sessionExpiryHandled) {
      sessionExpiryHandled = true;

      queryClient.clear();
      toasts.sessionExpired();

      window.setTimeout(() => {
        window.location.href = "/login?reason=session_expired";
      }, 1500);
    }

    return response;
  };

  interceptorAttached = true;
}
