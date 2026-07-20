import { LogoLoader } from '@/components/logo';

export default function Loading() {
  return (
  <div className="flex min-h-screen w-full items-center justify-center">
    <LogoLoader size={72} duration={2.4} className="text-foreground" />
  </div>
  );
}
