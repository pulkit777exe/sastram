import { cn } from '@/lib/utils/cn';

export function DetailCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-card p-5',
        className
      )}
    >
      {children}
    </div>
  );
}
