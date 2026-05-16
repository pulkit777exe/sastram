export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="skeleton h-4 w-24 mb-2" />
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-3xl border border-border bg-card p-6 space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-16" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
        <div className="skeleton h-5 w-40" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
