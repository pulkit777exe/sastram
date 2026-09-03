import { useEffect, useRef } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface AnimatedIconProps {
  icon: LucideIcon;
  animateOnHover?: boolean | string;
  animateOnTap?: boolean | string;
  animateOnView?: boolean | string;
  animateOnViewMargin?: string;
  animateOnViewOnce?: boolean;
  className?: string;
  size?: number;
}

export function AnimatedIcon({
  icon: Icon,
  animateOnHover,
  animateOnTap,
  animateOnView,
  animateOnViewMargin = '0px',
  animateOnViewOnce = true,
  className,
  size = 16,
  ...props
}: AnimatedIconProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!animateOnView) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        if (isVisible) {
          el.classList.add('animated-icon-visible');
          if (animateOnViewOnce) observer.unobserve(el);
          return;
        }
        if (!animateOnViewOnce) el.classList.remove('animated-icon-visible');
      },
      { rootMargin: animateOnViewMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animateOnView, animateOnViewMargin, animateOnViewOnce]);

  return (
    <span
      ref={ref}
      className={cn(
        'inline-block',
        animateOnHover && 'animated-icon-hover',
        animateOnTap && 'animated-icon-tap',
        animateOnView && 'animated-icon-view',
        className
      )}
      {...props}
    >
      <Icon size={size} />
    </span>
  );
}
