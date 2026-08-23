'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { X, PanelRightOpen } from 'lucide-react';

const DetailsContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function useDetails() {
  return useContext(DetailsContext);
}

export function ThreadDetailsPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <DetailsContext.Provider value={{ open, setOpen }}>
      {/* Floating trigger — top-right, sits above the composer/scroll area */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-[4.5rem] right-4 z-40 h-8 w-8 flex items-center justify-center rounded-lg border border-border/60 bg-card/95 backdrop-blur text-muted-foreground shadow-linear-sm hover:bg-muted/40 hover:text-foreground transition-colors"
        aria-label="Show thread details"
        title="Thread details"
      >
        <PanelRightOpen size={15} />
      </button>

      {/* Slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-canvas border-l border-line shadow-overlay flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <span className="text-sm font-semibold text-ink tracking-tight">Thread Details</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close details"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-hover/40 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </div>
        </div>
      )}
    </DetailsContext.Provider>
  );
}
