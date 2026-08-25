export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-1/3" />
      <div className="grid gap-6 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-3xl border border-line bg-surface p-6">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="skeleton h-64 w-full rounded-3xl" />
    </div>
  );
}