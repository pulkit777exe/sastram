'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { clientLogger } from '@/lib/utils/client-logger';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Don't spam logs for DB/network errors in dev - they're expected when DB is down
    const msg = error.message ?? '';
    const isDbError = msg.includes('ENOTFOUND') || msg.includes('DATABASE_URL') || msg.includes('network error') || msg.includes('Failed to get session');
    if (!isDbError) {
      clientLogger.error('root-error', error.message ?? 'Unknown error', error.digest);
    }
  }, [error]);

  const msg = error.message ?? '';
  const isDbError = msg.includes('Failed to get session') || error.digest === '3914836991' || msg.includes('network error');
  const isEnotfound = msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || (error as unknown as { code?: string })?.code === 'ENOTFOUND';

  if (isDbError || isEnotfound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <div className="rounded-full bg-amber-100 p-3">
          <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Database Unavailable</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          The database is not reachable. For local development, run <code className="px-1 py-0.5 bg-muted rounded text-xs">docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sastram postgres:16</code> or check your DATABASE_URL in .env
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button variant="default" onClick={() => window.location.href = '/login'}>
            Go to Login
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-xs text-muted-foreground max-w-md">
            <summary className="cursor-pointer">Error details (dev only)</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-left overflow-auto max-h-32">{error.message.slice(0, 500)}</pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-100 gap-4">
      <p className="text-muted-foreground text-sm">Something went wrong loading this page.</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
