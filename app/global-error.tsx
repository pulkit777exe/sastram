"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Unexpected error
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error?.message || "Please try again."}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
