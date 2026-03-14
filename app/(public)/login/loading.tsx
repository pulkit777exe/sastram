export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md border border-border rounded-2xl p-8 space-y-4 bg-card">
        <div className="skeleton h-7 w-1/2" />
        <div className="skeleton h-4 w-2/3" />
        <div className="space-y-3">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
        </div>
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}
