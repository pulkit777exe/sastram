'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';
import { BootstrapProvider } from '@/components/bootstrap-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="sastram-theme"
    >
      <BootstrapProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {children}
        </TooltipProvider>
      </BootstrapProvider>
    </ThemeProvider>
  );
}
