'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

const DetailsContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

function useDetails() {
  const ctx = useContext(DetailsContext);
  if (!ctx) throw new Error('ThreadDetailsPanel subcomponents must be used within ThreadDetailsPanel');
  return ctx;
}

export function ThreadDetailsPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <DetailsContext.Provider value={{ open, setOpen }}>
      {/* Static column on xl+ */}
      <div className="hidden xl:flex xl:flex-col shrink-0">{children}</div>

      {/* Floating trigger (below xl) — top-right, sits above the composer/scroll area */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="xl:hidden fixed top-[76px] right-4 z-40 flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border/60 bg-background/95 backdrop-blur text-xs font-semibold text-muted-foreground shadow-linear-sm hover:bg-muted/40 hover:text-foreground transition-colors"
        aria-label="Show thread details"
      >
        Details
      </button>

      {/* Slide-over below xl */}
      {open && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-[88%] max-w-[360px] bg-background border-l border-border/60 shadow-linear-lg animate-in slide-in-from-right-2 duration-200 overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Thread Details
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close details"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>
            <div className="flex flex-col">{children}</div>
          </div>
        </div>
      )}
    </DetailsContext.Provider>
  );
}
