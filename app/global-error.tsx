'use client';

import { useEffect } from 'react';
import { clientLogger } from '@/lib/utils/client-logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error('global-error', error.message, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background">
        <div className="flex flex-col items-center justify-center min-h-100 gap-4">
          <p className="text-muted-foreground text-sm">Something went wrong loading this page.</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-line px-3 py-2 text-sm hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
