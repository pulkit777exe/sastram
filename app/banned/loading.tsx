export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-2xl space-y-6 text-center">
        <div className="skeleton h-16 w-16 rounded-full mx-auto" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-2/3 mx-auto" />
          <div className="skeleton h-4 w-full" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-4/6" />
        </div>
      </div>
    </div>
  );
}
