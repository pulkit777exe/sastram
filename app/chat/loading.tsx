export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-4">
      <div className="skeleton h-8 w-1/4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="skeleton h-[60vh] rounded-xl" />
        <div className="skeleton h-[60vh] rounded-xl md:col-span-2" />
      </div>
    </div>
  );
}
