'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATION CARD
 * The card holds its shape. Pressing "Alternatives" opens a
 * new drawer listing the other options; picking one promotes
 * it to the recommendation. The primary action confirms.
 * ───────────────────────────────────────────────────────── */

type Option = {
  key: string;
  body: React.ReactNode;
  short: string;
  signal: number;
  tone: string;
  label: string;
  cta: string;
  ctaStyle: string;
};

const OPTIONS: Option[] = [
  {
    key: 'high',
    body: (
      <>
        Reorder waffle cones from{' '}
        <code className="rounded-md bg-sai-accent-tint px-1.5 py-0.5 font-mono text-[12px] text-sai-accent-ink">cone_king</code>{' '}
        with lead time{' '}
        <code className="rounded-md bg-sai-accent-tint px-1.5 py-0.5 font-mono text-[12px] text-sai-accent-ink">7_days</code>.
      </>
    ),
    short: 'Reorder from cone_king · 7-day lead',
    signal: 3,
    tone: 'var(--green)',
    label: 'High confidence',
    cta: 'Accept',
    ctaStyle: 'bg-sai-accent text-white',
  },
  {
    key: 'review',
    body: (
      <>
        Switch vanilla to{' '}
        <code className="rounded-md bg-orange-tint px-1.5 py-0.5 font-mono text-[12px] text-orange">vanilla_madagascar</code>{' '}
        for peak season.
      </>
    ),
    short: 'Switch to vanilla_madagascar',
    signal: 2,
    tone: 'var(--orange)',
    label: 'Needs review',
    cta: 'Configure',
    ctaStyle: 'bg-ink text-canvas',
  },
  {
    key: 'none',
    body: (
      <>
        Fall back to a <span className="font-medium text-ink">full restock</span> across every SKU.
      </>
    ),
    short: 'Full restock across every SKU',
    signal: 0,
    tone: 'var(--ink-3)',
    label: 'No signal',
    cta: 'Accept full restock',
    ctaStyle: 'bg-ink text-canvas',
  },
];

function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{ height: 10, background: bar < signal ? tone : 'var(--line-strong)' }}
        />
      ))}
    </span>
  );
}

export function RecommendationCard() {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const active = OPTIONS[selected];
  const others = OPTIONS.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  return (
    <div className="w-full max-w-md overflow-hidden rounded-card bg-surface border border-line shadow-card">
      <div className="p-4 md:p-5">
        <span className="text-[13px] font-semibold text-ink">
          Want me to place this restock order?
        </span>
        <div
          key={active.key}
          className="mt-1.5 min-h-[48px] text-[13px] leading-relaxed text-ink-2"
          style={{ animation: 'fade-in 180ms ease-out both' }}
        >
          {active.body}
        </div>
      </div>

      {/* alternatives drawer — a distinctly new section of the card */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 border-t border-line"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="overflow-hidden">
          <div className="bg-inset px-2 py-2">
            <p className="px-1.5 pb-1 text-[11px] font-medium text-ink-3">
              Other options
            </p>
            {others.map(({ o, i }) => (
              <Button
                key={o.key}
                variant="ghost"
                className="w-full justify-start gap-2.5 rounded-control px-1.5 py-1.5 h-auto text-left"
                onClick={() => {
                  setSelected(i);
                  setAccepted(false);
                  setOpen(false);
                }}
              >
                <Meter signal={o.signal} tone={o.tone} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.short}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{o.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3 border-t border-line bg-inset">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12.5px] font-medium text-ink-2">{active.label}</span>
        </span>

        <span className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="h-7 rounded-control px-2.5 text-[12.5px] font-medium shadow-btn"
          >
            Alternatives
          </Button>
          <Button
            size="sm"
            onClick={() => setAccepted(true)}
            className={`h-7 rounded-control px-3 text-[12.5px] font-medium shadow-btn
              ${accepted ? 'bg-green text-white' : active.ctaStyle}`}
          >
            {accepted ? 'Accepted' : active.cta}
          </Button>
        </span>
      </div>
    </div>
  );
}
