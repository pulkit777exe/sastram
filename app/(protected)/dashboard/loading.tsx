import { BrandLoader } from '@/components/ui/brand-loader';

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <BrandLoader size={44} />
    </div>
  );
}
