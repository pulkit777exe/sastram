export default function Loading() {
  return (
    <div className="space-y-10 max-w-4xl">
      <div className="space-y-2">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-2/3" />
      </div>
      <div className="skeleton h-10 w-64 rounded-xl" />
      <div className="space-y-4">
        <div className="skeleton h-14 w-full rounded-xl" />
        <div className="skeleton h-14 w-full rounded-xl" />
        <div className="skeleton h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
