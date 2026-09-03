'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { X, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const DetailsContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function useDetails() {
  return useContext(DetailsContext);
}

export function ThreadDetailsPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const openPanel = useCallback(() => setOpen(true), []);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    if (!panelRef.current) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const panelEl = panelRef.current;
      if (!panelEl) return;
      const focusable = panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      const isFirstFocused = document.activeElement === first;
      const isLastFocused = document.activeElement === last;

      if (e.shiftKey && isFirstFocused) {
        e.preventDefault();
        last.focus();
        return;
      }

      if (!e.shiftKey && isLastFocused) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  // Restore focus to trigger when drawer closes
  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  const panelId = 'thread-details-panel';

  return (
    <DetailsContext.Provider value={{ open, setOpen }}>
      <Button
        ref={triggerRef}
        variant="outline"
        size="icon"
        className="fixed top-[4.5rem] right-4 z-40 backdrop-blur rounded-control"
        onClick={openPanel}
        aria-label="Show thread details"
        aria-expanded={open}
        aria-controls={panelId}
        title="Thread details"
      >
        <PanelRightOpen size={15} />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm animate-in fade-in duration-150"
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Thread details"
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-canvas border-l border-line shadow-overlay flex flex-col animate-in slide-in-from-right duration-200"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <span className="text-sm font-semibold text-ink tracking-tight">Thread Details</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={close}
                aria-label="Close details"
              >
                <X size={15} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </div>
        </div>
      )}
    </DetailsContext.Provider>
  );
}
