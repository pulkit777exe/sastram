'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface OverflowMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

export function OverflowMenu({
  items,
  className,
}: {
  items: OverflowMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, close]);

  // Focus first item when menu opens
  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector<HTMLElement>('button');
      if (first) first.focus();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      const menuItems = menuRef.current?.querySelectorAll<HTMLElement>('button');
      if (!menuItems || menuItems.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(menuItems.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          close();
          buttonRef.current?.focus();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < items.length) {
            items[activeIndex].onClick();
            close();
          }
          break;
      }
    },
    [open, activeIndex, items, close]
  );

  // Sync activeIndex with focus
  useEffect(() => {
    if (activeIndex < 0 || !menuRef.current) return;
    const menuItems = menuRef.current.querySelectorAll<HTMLElement>('button');
    menuItems[activeIndex]?.focus();
  }, [activeIndex]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className="h-8 w-8 flex items-center justify-center rounded-control text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 bottom-full z-30 mb-1 w-44 rounded-card border border-line bg-surface shadow-overlay p-1"
          onKeyDown={handleKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                item.onClick();
                close();
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm transition-colors hover:bg-hover',
                index === activeIndex && 'bg-hover',
                item.destructive
                  ? 'text-destructive hover:text-destructive'
                  : 'text-foreground'
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
