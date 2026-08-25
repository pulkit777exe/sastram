export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="skeleton h-10 w-48" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton h-24 rounded-card" />
        <div className="skeleton h-24 rounded-card" />
        <div className="skeleton h-24 rounded-card" />
      </div>
      <div className="skeleton h-64 rounded-card" />
      <div className="skeleton h-48 rounded-card" />
    </div>
  );
}
