import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <BrandLoader size={40} />
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
