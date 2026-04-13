export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-8 w-1/3" />
        <div className="skeleton h-4 w-2/3" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl" />
      <div className="space-y-3">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
