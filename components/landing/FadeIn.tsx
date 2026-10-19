'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll wrapper driven by IntersectionObserver + the existing
 * `fade-up` keyframe (globals.css) instead of framer-motion. Same cadence and
 * delay semantics as the previous motion.div; reduced-motion handling comes
 * from the global `animation-duration: 0.01ms !important` base rule.
 */
export function FadeIn({
  children,
  className = '',
  delay = 0,
  y = 20,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Matches the previous framer-motion useInView margin: '-60px'.
      { rootMargin: '-60px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        {
          '--fade-up-y': `${y}px`,
          opacity: visible ? undefined : 0,
          animation: visible
            ? `fade-up 500ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both`
            : undefined,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
