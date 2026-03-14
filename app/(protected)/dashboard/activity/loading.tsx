export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <div className="skeleton h-6 w-6 rounded-full" />
        <div className="skeleton h-7 w-40" />
      </div>
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
