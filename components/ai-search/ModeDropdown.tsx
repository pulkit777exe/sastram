'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown } from 'lucide-react';

interface ModeDropdownOption<T extends string> {
  value: T;
  label: string;
}

interface ModeDropdownProps<T extends string> {
  label: string;
  value: T;
  options: readonly ModeDropdownOption<T>[];
  onChange: (value: T) => void;
}

/**
 * Shared trigger + listbox pattern, replacing the two duplicated inline
 * dropdown implementations that previously lived in SearchBox (Exa mode,
 * Tavily mode). Closes on outside click and Escape, exposes proper
 * listbox semantics for a11y.
 */
export function ModeDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: ModeDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded-md hover:bg-foreground/5 cursor-pointer"
      >
        {label}: {current?.label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full mb-1 right-0 bg-popover border border-border rounded-lg shadow-linear-lg py-1 z-50 min-w-30"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                value === opt.value
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}