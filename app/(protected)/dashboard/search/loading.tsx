import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <BrandLoader size={40} />
      <div className="skeleton h-14 w-full rounded-xl" />
      <div className="space-y-3">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>
    </div>
  );
}
