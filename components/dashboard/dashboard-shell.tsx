'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/dashboard/sidebar';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function DashboardShell({
  children,
  name,
  email,
  role,
}: {
  children: React.ReactNode;
  name: string;
  email: string;
  role: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Close sheet on navigation (next.js route change)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheetOpen(false);
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        {/* Mobile top bar — modern, branded, simple */}
        <div className="flex items-center justify-between h-14 px-4 bg-surface/90 backdrop-blur-md border-b border-line shrink-0 supports-[backdrop-filter]:bg-surface/70">
          <div className="flex items-center gap-3">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="size-9 -ml-1.5">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Sidebar
                  name={name}
                  email={email}
                  role={role}
                  mobile
                  onNavigate={() => setSheetOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <a href="/dashboard" className="flex items-center gap-2.5">
              <Logo className="size-7" brand />
              <span className="font-serif-heading text-[18px] leading-none tracking-tight text-ink">Sastram</span>
            </a>
          </div>
          <div className="size-9 shrink-0" aria-hidden />
        </div>

        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto bg-background">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background p-4 gap-4 overflow-hidden">
      <aside className="h-full shrink-0">
        <Sidebar name={name} email={email} role={role} />
      </aside>
      <div className="flex flex-1 flex-col bg-surface rounded-card border border-line overflow-hidden">
        <main id="main-content" className="flex-1 overflow-y-auto p-8 text-ink">
          {children}
        </main>
      </div>
    </div>
  );
}
