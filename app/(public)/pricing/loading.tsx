export default function PricingLoading() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-4 w-64" />
        <div className="skeleton h-64 w-full rounded-2xl" />
        <div className="skeleton h-72 w-full rounded-2xl" />
      </div>
    </main>
  );
}
