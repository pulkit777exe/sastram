"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Dashboard error
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
  );
}
