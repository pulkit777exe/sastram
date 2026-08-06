'use client';

import { useEffect } from 'react';
import { clientLogger } from '@/lib/utils/client-logger';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error('root-error', error.message, error.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircle size={20} className="text-destructive" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground mb-1">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          An unexpected error occurred. Please try again or return to the homepage.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}
