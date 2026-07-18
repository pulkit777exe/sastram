import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="space-y-10 max-w-5xl">
      <BrandLoader size={40} />
      <div className="space-y-3">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>
    </div>
  );
}
