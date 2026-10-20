export default function PricingLoading() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="skeleton h-80 w-full rounded-card" />
          <div className="skeleton h-80 w-full rounded-card" />
        </div>
      </div>
    </main>
  );
}
