import { BrandLoader } from '@/components/ui/brand-loader';

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <BrandLoader size={48} label="Searching with Sai…" />
    </div>
  );
}
