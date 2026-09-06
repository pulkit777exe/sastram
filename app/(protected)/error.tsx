'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col items-center justify-center min-h-100 gap-4">
      <p className="text-muted-foreground text-sm">Something went wrong loading this page.</p>
      <Button
        variant="outline"
        onClick={reset}
      >
        Try again
      </Button>
    </div>
  );
}
