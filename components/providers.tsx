'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="sastram-theme"
    >
      <TooltipProvider>
        <Sonner />
        {children}
      </TooltipProvider>
    </ThemeProvider>
  );
}
