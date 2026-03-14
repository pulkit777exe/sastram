export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="skeleton h-6 w-32" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  );
}
