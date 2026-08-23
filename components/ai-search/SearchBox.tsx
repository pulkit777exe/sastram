'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';

import type { SearchConfig } from '@/modules/ai-search/types';

interface SearchBoxProps {
  onSearch: (query: string, config: SearchConfig) => void;
  isLoading: boolean;
  compact?: boolean;
  initialQuery?: string;
}

const MODELS = [
  { key: 'standard', name: 'Standard' },
  { key: 'instant', name: 'Instant' },
  { key: 'table', name: 'Table' },
];

const COMMANDS = [
  { key: 'compare', name: '/compare', desc: 'Compare sources side-by-side' },
  { key: 'summarize', name: '/summarize', desc: 'Summarize results so far' },
  { key: 'restock', name: '/restock', desc: 'Build a reorder list' },
  { key: 'table', name: '/table', desc: 'Return results as a table' },
  { key: 'draft', name: '/draft', desc: 'Draft a report from results' },
];

const SOURCE_FILTERS = [
  { value: 'all', label: 'All Sources' },
  { value: 'technical', label: 'Technical' },
  { value: 'reddit-hn', label: 'Reddit & HN' },
  { value: 'docs', label: 'Official Docs' },
] as const;

function parseToken(draft: string): { kind: 'slash'; query: string; start: number } | null {
  const match = /(^|\s)(\/)([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: 'slash',
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
}

export function SearchBox({
  onSearch,
  isLoading,
  compact = false,
  initialQuery = '',
}: SearchBoxProps) {
  const [draft, setDraft] = useState(initialQuery);
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SearchConfig['sourceFilter']>('all');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);

  const token = dismissed ? null : parseToken(draft);
  const menu = token?.kind ?? null;
  const query = token?.query ?? '';
  const rows = menu === 'slash' ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query)) : [];

  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, rows.length]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls || !measure || !modelButton) return;

    const fixedWidth = 28 * 2 + modelButton.offsetWidth;
    const inlineWidth = controls.clientWidth - fixedWidth - 16;
    const needsFullWidth = draft.includes('\n') || measure.offsetWidth + 8 > inlineWidth;
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth);

    input.style.height = '0px';
    const content = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(content, 28), 120)}px`;
    input.style.overflowY = content > 120 ? 'auto' : 'hidden';
  }, [draft, expanded]);

  const pick = (row: { name: string }) => {
    setDraft(`${token ? draft.slice(0, token.start) : draft}${row.name} `);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = draft.trim().length >= 3 && !isLoading;

  const send = () => {
    if (!canSend) return;
    onSearch(draft.trim(), {
      exaMode: 'agentic',
      tavilyMode: 'search',
      sourceFilter,
      searchMode: model.key as SearchConfig['searchMode'],
    });
    setDraft('');
    setDismissed(true);
  };

  return (
    <div className="w-full transition-all duration-300">
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSourceOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-control border border-line text-ink-2 hover:border-line-strong hover:text-ink transition-colors"
            >
              <Filter size={12} />
              {SOURCE_FILTERS.find((f) => f.value === sourceFilter)?.label ?? 'All Sources'}
            </button>
            {sourceOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-card bg-surface border border-line p-1 shadow-xl">
                {SOURCE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSourceFilter(f.value);
                      setSourceOpen(false);
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-sm transition-colors hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                      {f.label}
                    </span>
                    {sourceFilter === f.value && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer card */}
      <div className="relative">
        {/* /command menu */}
        {menu && rows.length > 0 && (
          <div
            onMouseLeave={() => setEngaged(false)}
            className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-card bg-surface border border-line p-1 shadow-xl"
            style={{
              animation: 'pop-in 180ms cubic-bezier(0.23,1,0.32,1) both',
              transformOrigin: 'bottom center',
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: rowBox?.top ?? 0,
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged ? 1 : 0,
                transition:
                  'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
              }}
            />
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
              >
                <span className="shrink-0 text-[12.5px] font-medium text-ink font-mono">
                  {row.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                  {row.desc}
                </span>
              </button>
            ))}
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-2">
              Type to search commands · ↑↓ to navigate · Enter to pick
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="relative">
          <div
            className={`relative flex flex-col gap-1 bg-surface border border-line p-4 transition-[border-radius,border-color,box-shadow] duration-150 rounded-card shadow-card focus-within:shadow-raised focus-within:border-line-strong`}
          >
          <span
            ref={measureRef}
            aria-hidden
            className="pointer-events-none absolute invisible whitespace-pre text-[14px] leading-5"
          >
            {draft}
          </span>

          <div
            ref={controlsRef}
            className="grid items-end gap-x-0.5 gap-y-2 grid-cols-[minmax(0,1fr)_auto_24px_24px]"
          >
            {/* Textarea */}
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.substring(0, 500));
                setDismissed(false);
                setModelOpen(false);
              }}
              onKeyDown={(e) => {
                if (menu && rows.length > 0) {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setEngaged(true);
                    setActive(
                      (a) => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length
                    );
                    return;
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                    e.preventDefault();
                    pick(rows[active]);
                    return;
                  }
                }
                if (e.key === 'Escape') {
                  setDismissed(true);
                  setModelOpen(false);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={isLoading}
              placeholder={compact ? 'Search again…' : 'Search or type / for commands…'}
              aria-label="Search query"
              className="min-h-7 min-w-0 w-full col-span-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-ink outline-none wrap:anywhere placeholder:text-ink-2"
            />

            {/* Model picker */}
            <div className="relative col-start-1 row-start-2">
              <button
                ref={modelRef}
                type="button"
                aria-expanded={modelOpen}
                aria-label="Choose search mode"
                onClick={() => setModelOpen((o) => !o)}
                className="flex h-6 shrink-0 items-center gap-1 px-2 text-[11px] font-medium text-ink-2 border border-line rounded-md transition-colors duration-150 hover:border-line-strong hover:text-ink"
              >
                {model.name}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {modelOpen && (
                <div
                  className="absolute left-0 bottom-full z-20 mb-1 w-fit min-w-30 rounded-card bg-surface border border-line p-1 shadow-xl"
                  style={{
                    animation: 'pop-in 180ms cubic-bezier(0.23,1,0.32,1) both',
                    transformOrigin: 'bottom left',
                  }}
                >
                  {MODELS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setModel(m);
                        setModelOpen(false);
                        inputRef.current?.focus();
                      }}
                      className="flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left transition-colors duration-100 hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                        {m.name}
                      </span>
                      <span
                        className={`shrink-0 text-ink ${m.key === model.key ? '' : 'invisible'}`}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!compact && (
              <span className="col-start-2 row-start-2 text-[11px] text-ink-2 flex items-center gap-1 h-6 px-0.5">
                {sourceFilter !== 'all' && (
                  <span className="inline-flex h-4.5 items-center rounded px-1 text-[10px] text-ink bg-hover gap-0.5">
                    {SOURCE_FILTERS.find((f) => f.value === sourceFilter)?.label}
                    <button
                      type="button"
                      onClick={() => setSourceFilter('all')}
                      className="text-ink-2 hover:text-ink"
                    >
                      ×
                    </button>
                  </span>
                )}
              </span>
            )}

            {/* Send */}
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 enabled:active:scale-[0.94] col-start-4 row-start-2"
              style={{
                background: canSend ? 'var(--sai-accent)' : 'var(--field)',
                color: canSend ? 'white' : 'var(--ink-2)',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        </div>
      </div>

      {!compact && draft.length > 400 && (
        <p className="text-xs text-ink-2 mt-1 text-right">{draft.length}/500</p>
      )}
    </div>
  );
}
