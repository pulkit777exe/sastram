'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { attachApiInterceptor } from '@/lib/utils/api-interceptor';

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
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
