import { LogoLoader } from '@/components/logo';

interface BrandLoaderProps {
  size?: number;
  duration?: number;
  label?: string;
  className?: string;
}

export function BrandLoader({ size = 48, duration = 2.4, label, className }: BrandLoaderProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className ?? ''}`}>
      <LogoLoader size={size} duration={duration} className="text-foreground" />
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  );
}
