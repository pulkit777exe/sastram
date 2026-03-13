export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton h-7 w-32" />
      </div>
      <div className="skeleton h-14 w-full rounded-xl" />
      <div className="space-y-3">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>
    </div>
  );
}
