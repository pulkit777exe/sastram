export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-1/3" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-40 rounded-card" />
        <div className="skeleton h-40 rounded-card" />
      </div>
      <div className="skeleton h-64 rounded-card" />
    </div>
  );
}
