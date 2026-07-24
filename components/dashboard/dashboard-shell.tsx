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
      <div className="flex flex-col h-screen bg-muted/40 overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border shrink-0">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="flex items-center justify-center h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu size={20} />
              </button>
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
          <span className="text-sm font-semibold text-foreground">Sastram</span>
          <div className="w-11" />
        </div>

        {/* Mobile content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/40 p-4 gap-4 overflow-hidden">
      <aside className="h-full shrink-0">
        <Sidebar name={name} email={email} role={role} />
      </aside>
      <div className="flex flex-1 flex-col bg-card rounded-2xl border border-border overflow-hidden">
        <main id="main-content" className="flex-1 overflow-y-auto p-8 text-foreground">
          {children}
        </main>
      </div>
    </div>
  );
}
