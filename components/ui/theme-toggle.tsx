'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={cn('w-14 h-8 rounded-full bg-muted border border-line', className)} />;
  }

  const isDark = theme === 'dark';

  function handleToggle() {
    if (isDark) setTheme('light');
    else setTheme('dark');
  }

  return (
    <div
      className={cn(
        'relative flex w-14 h-8 rounded-full bg-muted border border-line p-1 cursor-pointer transition-colors',
        className
      )}
      onClick={handleToggle}
    >
      <div className="flex justify-between items-center w-full px-1">
        <Sun className="h-4 w-4 text-muted-foreground opacity-50" />
        <Moon className="h-4 w-4 text-muted-foreground opacity-50" />
      </div>
      <div
        className={cn(
          'absolute top-1 left-1 h-5.5 w-5.5 rounded-full bg-background shadow-sm transition-transform duration-300 flex items-center justify-center',
          isDark ? 'translate-x-6' : 'translate-x-0'
        )}
      >
        {isDark ? <Moon className="h-3 w-3 text-foreground" /> : <Sun className="h-3 w-3 text-foreground" />}
      </div>
    </div>
  );
}
