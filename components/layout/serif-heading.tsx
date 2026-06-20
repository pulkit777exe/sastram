import { cn } from '@/lib/utils/cn';

export function SerifHeading({
  children,
  className,
  as: Tag = 'span',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
}) {
  return (
    <Tag className={cn('font-serif-heading', className)}>{children}</Tag>
  );
}
