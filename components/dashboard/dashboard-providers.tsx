'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { attachApiInterceptor } from '@/lib/utils/api-interceptor';

const STALE_TIME_MS = 60 * 1000;
const GC_TIME_MS = 10 * 60 * 1000;

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME_MS,
            gcTime: GC_TIME_MS,
            retry: (failureCount, error) => {
              const message = error instanceof Error ? error.message : String(error);

              if (message.includes('not iterable')) return false;
              if (message.includes('401')) return false;

              return failureCount < 2;
            },
          },
        },
      })
  );

  useEffect(() => {
    attachApiInterceptor(queryClient);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
