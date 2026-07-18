'use client';

import { useEffect, useId, useRef } from 'react';
import { useTheme } from 'next-themes';

type Theme = 'light' | 'dark' | 'system';

type ResolvedTheme = Exclude<Theme, 'system'>;

interface LogoProps {
  theme?: Theme;
  brand?: boolean;
  className?: string;
}

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#111111',
  dark: '#F5F5F5',
};

export function Logo({ theme, brand = false, className }: LogoProps) {
  const { resolvedTheme } = useTheme();

  const resolved: ResolvedTheme =
    theme && theme !== 'system' ? theme : resolvedTheme === 'dark' ? 'dark' : 'light';

  const fill = brand ? 'var(--brand)' : THEME_COLORS[resolved];

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className={className}>
      <path
        fillRule="evenodd"
        fill={fill}
        d="
          M30,11 H42 A19,19 0 0 1 61,30 V42 A19,19 0 0 1 42,61 H30 A19,19 0 0 1 11,42 V30 A19,19 0 0 1 30,11 Z
          M58,39 H70 A19,19 0 0 1 89,58 V70 A19,19 0 0 1 70,89 H58 A19,19 0 0 1 39,70 V58 A19,19 0 0 1 58,39 Z
        "
      />
    </svg>
  );
}

interface LogoLoaderProps {
  theme?: Theme;
  size?: number;
  duration?: number;
  className?: string;
}

function useResolvedTheme(theme: Theme): ResolvedTheme {
  const { resolvedTheme } = useTheme();
  if (theme && theme !== 'system') return theme;
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}

const SQUARE = 50;
const RADIUS = 19;
const REST_OFFSET = 28; // matches the static brand mark
const APART_OFFSET = 56; // fully separated, no overlap
const MERGED_OFFSET = 0; // fully coincident, reads as one solid square

function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function LogoLoader({ theme = 'light', size = 64, duration = 2.4, className }: LogoLoaderProps) {
  const resolved = useResolvedTheme(theme);
  const fill = THEME_COLORS[resolved];
  const maskId = useId();

  const rectARef = useRef<SVGRectElement>(null);
  const rectBRef = useRef<SVGRectElement>(null);
  const maskCutRef = useRef<SVGRectElement>(null);
  const pulseRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Writes the same offset/scale to every dependent node in one pass.
    const applyFrame = (offset: number, scale: number) => {
      const a = 25 - offset / 2;
      const b = 25 + offset / 2;
      rectARef.current?.setAttribute('x', String(a));
      rectARef.current?.setAttribute('y', String(a));
      rectBRef.current?.setAttribute('x', String(b));
      rectBRef.current?.setAttribute('y', String(b));
      maskCutRef.current?.setAttribute('x', String(b));
      maskCutRef.current?.setAttribute('y', String(b));
      if (pulseRef.current) pulseRef.current.style.transform = `scale(${scale})`;
    };

    if (reduceMotionQuery.matches) {
      applyFrame(REST_OFFSET, 1);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const cycleMs = Math.max(duration, 0.1) * 1000;

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = ((now - start) % cycleMs) / cycleMs; // 0..1 through the cycle
      const tri = t < 0.5 ? t * 2 : (1 - t) * 2; // 0 -> 1 -> 0 (apart -> merged -> apart)
      const eased = easeInOutQuint(tri);
      const offset = APART_OFFSET - eased * (APART_OFFSET - MERGED_OFFSET);
      const scale = 1 + eased * 0.045; // subtle emphasis right at the merge
      applyFrame(offset, scale);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMotionPrefChange = (e: MediaQueryListEvent) => {
      cancelAnimationFrame(raf);
      if (e.matches) {
        applyFrame(REST_OFFSET, 1);
      } else {
        start = null;
        raf = requestAnimationFrame(tick);
      }
    };
    reduceMotionQuery.addEventListener('change', onMotionPrefChange);

    return () => {
      cancelAnimationFrame(raf);
      reduceMotionQuery.removeEventListener('change', onMotionPrefChange);
    };
  }, [duration]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Loading"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <rect ref={maskCutRef} x="39" y="39" width={SQUARE} height={SQUARE} rx={RADIUS} fill="black" />
        </mask>
      </defs>

      <g ref={pulseRef} style={{ transformOrigin: '50px 50px' }}>
        <rect
          ref={rectARef}
          x="11" y="11" width={SQUARE} height={SQUARE} rx={RADIUS}
          fill={fill}
          mask={`url(#${maskId})`}
        />
        <rect ref={rectBRef} x="39" y="39" width={SQUARE} height={SQUARE} rx={RADIUS} fill={fill} />
      </g>
    </svg>
  );
}
