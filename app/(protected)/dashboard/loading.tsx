import { BrandLoader } from '@/components/ui/brand-loader';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <BrandLoader size={44} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl animate-pulse" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-64 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
