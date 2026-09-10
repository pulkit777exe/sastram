import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <BrandLoader size={36} label="Loading tags…" />
    </div>
  );
}
