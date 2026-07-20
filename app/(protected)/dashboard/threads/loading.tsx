import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <BrandLoader size={40} />
    </div>
  );
}
