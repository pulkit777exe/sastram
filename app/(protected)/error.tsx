'use client';

import { useEffect } from 'react';
import { clientLogger } from '@/lib/utils/client-logger';

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error('protected-error', error.message, error.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <p className="text-muted-foreground text-sm">Something went wrong loading this page.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}
