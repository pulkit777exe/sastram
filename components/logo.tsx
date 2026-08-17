'use client';

import type { CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils/cn';

type Theme = 'light' | 'dark' | 'system';

type ResolvedTheme = Exclude<Theme, 'system'>;

interface LogoProps {
  theme?: Theme;
  brand?: boolean;
  className?: string;
}

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: 'var(--ink)',
  dark: 'var(--foreground)',
};

export function Logo({ theme, brand = false, className }: LogoProps) {
  // Resolve the theme color via CSS (`dark:` variant) instead of reading
  // useTheme() during render: next-themes resolves from localStorage on the
  // client but not on the server, so a render-time branch produces different
  // `fill` attributes and a hydration mismatch for dark-mode users.
  const followsTheme = !brand && (!theme || theme === 'system');

  const fill = brand
    ? 'var(--brand)'
    : followsTheme
      ? 'currentColor'
      : THEME_COLORS[theme as ResolvedTheme];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn(followsTheme && 'text-ink dark:text-foreground', className)}
    >
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

export function LogoLoader({ theme = 'light', size = 64, duration = 2.4, className }: LogoLoaderProps) {
  const resolved = useResolvedTheme(theme);
  const fill = resolved === 'dark' ? THEME_COLORS.dark : 'var(--brand)';

  return (
    <span
      className={`sastram-loader ${className ?? ''}`}
      style={{
        '--sastram-loader-size': `${size}px`,
        '--sastram-loader-duration': `${Math.max(duration, 0.8)}s`,
        '--sastram-loader-color': fill,
      } as CSSProperties}
      role="status"
      aria-label="Loading Sastram"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
        <path
          className="sastram-loader-ghost"
          fill="currentColor"
          d="
            M30,11 H42 A19,19 0 0 1 61,30 V42 A19,19 0 0 1 42,61 H30 A19,19 0 0 1 11,42 V30 A19,19 0 0 1 30,11 Z
            M58,39 H70 A19,19 0 0 1 89,58 V70 A19,19 0 0 1 70,89 H58 A19,19 0 0 1 39,70 V58 A19,19 0 0 1 58,39 Z
          "
        />
        <path
          className="sastram-loader-mark"
          fill="currentColor"
          d="
            M30,11 H42 A19,19 0 0 1 61,30 V42 A19,19 0 0 1 42,61 H30 A19,19 0 0 1 11,42 V30 A19,19 0 0 1 30,11 Z
            M58,39 H70 A19,19 0 0 1 89,58 V70 A19,19 0 0 1 70,89 H58 A19,19 0 0 1 39,70 V58 A19,19 0 0 1 58,39 Z
          "
        />
        <rect className="sastram-loader-trace trace-a" x="11" y="11" width="50" height="50" rx="19" />
        <rect className="sastram-loader-trace trace-b" x="39" y="39" width="50" height="50" rx="19" />
      </svg>
    </span>
  );
}
