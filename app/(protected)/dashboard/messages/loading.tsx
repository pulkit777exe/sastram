export default function Loading() {
  return (
    <div className="space-y-10 max-w-5xl">
      <div className="space-y-2">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>
    </div>
  );
}
