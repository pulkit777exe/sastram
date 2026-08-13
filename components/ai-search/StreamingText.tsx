'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Source } from '@/modules/ai-search/types';
import { toasts } from '@/lib/utils/toast';

/* ─────────────────────────────────────────────────────────
 * STREAMING TEXT
 * Words resolve out of blur, inline source chips appear in
 * context, then actions and follow-up prompts become usable.
 * ───────────────────────────────────────────────────────── */

const WORD_MS = 30;

type Token = { text: string; cite?: Source };

export type FeedbackType = 'up' | 'down';

export type RetryStyle = 'same' | 'professional' | 'general' | 'tactical';

interface StreamingTextProps {
  /** Raw streaming text from the API (grows as chunks arrive). */
  text: string;
  /** Source objects keyed by citation marker [n] in the text. */
  sources?: Source[];
  /** Called when streaming ends and the full text has been shown. */
  onDone?: () => void;
  /** Optional follow-up suggestions. */
  followUps?: string[];
  /** Whether the stream is still active. */
  isStreaming: boolean;
  /** Whether this content was loaded from history (skip animation). */
  fromHistory?: boolean;
  /** Called when user wants to retry/regenerate. */
  onRetry?: (style: RetryStyle) => void;
  /** Called when user gives feedback. */
  onFeedback?: (type: FeedbackType, reason?: string) => void;
}

function SourceChip({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="ml-0 mr-1 inline-flex h-4.5 translate-y-[-1px] items-center gap-1 rounded-[5px]
        bg-inset pr-[3px] pl-[3px] align-middle font-mono text-[10.5px] text-ink-2 shadow-hairline
        transition-colors duration-150 hover:bg-hover hover:text-ink"
      style={{ animation: 'pop-in 250ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      <span className="size-3 rounded-[3px] bg-ink/10 flex items-center justify-center text-ink-3">
        <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
        </svg>
      </span>
      <span className="max-w-[80px] truncate">{source.domain}</span>
    </a>
  );
}

/** Parse text with [n] markers into word tokens and citation tokens. */
function buildTokens(text: string, sources: Source[]): Token[] {
  const tokens: Token[] = [];
  const regex = /\[(\d+)\]/g;
  let last = 0;

  for (const match of text.matchAll(regex)) {
    // Words before the citation
    const before = text.slice(last, match.index!);
    for (const word of before.split(' ').filter(Boolean)) {
      tokens.push({ text: word });
    }
    // Citation chip
    const markerNum = Number(match[1]);
    const source = sources.find((_, idx) => idx + 1 === markerNum);
    if (source) tokens.push({ text: '', cite: source });
    last = match.index! + match[0].length;
  }

  // Remaining words
  const tail = text.slice(last);
  for (const word of tail.split(' ').filter(Boolean)) {
    tokens.push({ text: word });
  }

  return tokens;
}

const RETRY_STYLES: { key: RetryStyle; label: string; desc: string }[] = [
  { key: 'same',         label: 'Same prompt',    desc: 'Regenerate with the exact same query' },
  { key: 'professional', label: 'Professional',   desc: 'Rewrite with a formal, professional tone' },
  { key: 'general',      label: 'General',        desc: 'Rewrite for a broader, more accessible audience' },
  { key: 'tactical',     label: 'Tactical',       desc: 'Rewrite with actionable, step-by-step focus' },
];

const DISLIKE_REASONS: { key: string; label: string }[] = [
  { key: 'inaccurate',   label: 'Factually inaccurate' },
  { key: 'irrelevant',   label: 'Not relevant to my query' },
  { key: 'incomplete',   label: 'Incomplete or missing info' },
  { key: 'outdated',     label: 'Outdated information' },
  { key: 'unclear',      label: 'Hard to understand' },
  { key: 'other',        label: 'Something else' },
];

export function StreamingText({
  text,
  sources = [],
  onDone,
  followUps = [],
  isStreaming,
  fromHistory = false,
  onRetry,
  onFeedback,
}: StreamingTextProps) {
  const [count, setCount] = useState(fromHistory ? Infinity : 0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const allTokens = buildTokens(text, sources);
  const done = !isStreaming && count >= allTokens.length;

  // Feedback state
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
  const [showRetryPopover, setShowRetryPopover] = useState(false);
  const [showDislikePopover, setShowDislikePopover] = useState(false);
  const [dislikeReason, setDislikeReason] = useState<string | null>(null);
  const retryRef = useRef<HTMLDivElement>(null);
  const dislikeRef = useRef<HTMLDivElement>(null);

  // Animate words in (skip animation when loaded from history)
  useEffect(() => {
    if (fromHistory) return;
    if (count >= allTokens.length) {
      if (!isStreaming) onDone?.();
      return;
    }
    const t = setTimeout(() => setCount((c) => c + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [count, allTokens.length, isStreaming, onDone, fromHistory]);

  const isStreamingRef = useRef(isStreaming);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Reset count when streaming starts: only when isStreaming changes from false to true
  useEffect(() => {
    if (!fromHistory && !isStreamingRef.current && isStreaming) {
      setCount(0);
    }
  }, [isStreaming, fromHistory]);

  // Close popovers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (retryRef.current && !retryRef.current.contains(e.target as Node)) {
        setShowRetryPopover(false);
      }
      if (dislikeRef.current && !dislikeRef.current.contains(e.target as Node)) {
        setShowDislikePopover(false);
        setDislikeReason(null);
      }
    }
    if (showRetryPopover || showDislikePopover) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showRetryPopover, showDislikePopover]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toasts.copied();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toasts.error('Failed to copy', 'Please try selecting and copying manually.');
    }
  };

  const handleRetry = (style: RetryStyle) => {
    setShowRetryPopover(false);
    onRetry?.(style);
  };

  const handleUpvote = () => {
    if (feedbackGiven) return;
    setFeedbackGiven('up');
    toasts.success('Thanks for your feedback!', 'This helps improve Sai synthesis.');
    onFeedback?.('up');
  };

  const handleDownvote = () => {
    if (feedbackGiven === 'up') return;
    if (showDislikePopover) return;
    setShowDislikePopover(true);
  };

  const handleDislikeSubmit = () => {
    setFeedbackGiven('down');
    setShowDislikePopover(false);
    toasts.success('Thanks for your feedback!', "We'll use this to improve results.");
    onFeedback?.('down', dislikeReason ?? undefined);
    setDislikeReason(null);
  };

  const displayedSources = sources.slice(0, 10);

  const plainText = text;

  return (
    <div className="w-full">
      {/* Streaming content */}
      <p className="text-[13px] leading-relaxed text-ink">
        {allTokens.slice(0, count).map((token, i) =>
          token.cite ? (
            <SourceChip key={i} source={token.cite} />
          ) : (
            <span
              key={i}
              className="inline [will-change:filter,opacity]"
              style={fromHistory ? undefined : { animation: 'stream-in 420ms cubic-bezier(0.22,0.61,0.25,1) both' }}
            >
              {token.text}{' '}
            </span>
          ),
        )}
        {!done && !fromHistory && (
          <span
            className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink"
            style={{ animation: 'fade-in 150ms ease-out both' }}
          />
        )}
      </p>

      {/* Action row */}
      <div
        className="mt-2 flex items-center gap-0.5 transition-opacity duration-400"
        style={{ opacity: done ? 1 : 0, pointerEvents: done ? 'auto' : 'none' }}
      >
        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy'}
          className={`flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100 hover:bg-hover-2 ${
            copied ? 'text-sai-green' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <g>
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </g>
            </svg>
          )}
        </button>

        {/* Retry/Regenerate */}
        <div ref={retryRef} className="relative">
          <button
            type="button"
            onClick={() => { setShowRetryPopover((o) => !o); }}
            aria-label="Regenerate"
            className="flex size-6 items-center justify-center rounded-[6px] text-ink-3
              transition-colors duration-100 hover:bg-hover-2 hover:text-ink-2"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
          {showRetryPopover && (
            <div
              className="absolute left-0 bottom-full z-20 mb-2 w-56 rounded-[10px] bg-surface p-1 shadow-raised"
              style={{ animation: 'pop-in 180ms cubic-bezier(0.23,1,0.32,1) both' }}
            >
              <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-ink-3 uppercase tracking-wider">Regenerate as</p>
              {RETRY_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleRetry(s.key)}
                  className="flex w-full flex-col rounded-[6px] px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
                >
                  <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                  <span className="text-[11px] text-ink-3">{s.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upvote */}
        <button
          type="button"
          onClick={handleUpvote}
          aria-label="Helpful"
          disabled={feedbackGiven !== null}
          className={`flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100 ${
            feedbackGiven === 'up'
              ? 'text-sai-green'
              : feedbackGiven === 'down'
                ? 'text-ink-3/40 cursor-not-allowed'
                : 'text-ink-3 hover:bg-hover-2 hover:text-ink-2'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={feedbackGiven === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" />
          </svg>
        </button>

        {/* Downvote */}
        <div ref={dislikeRef} className="relative">
          <button
            type="button"
            onClick={handleDownvote}
            aria-label="Not helpful"
            disabled={feedbackGiven === 'up'}
            className={`flex size-6 items-center justify-center rounded-[6px] transition-colors duration-100 ${
              feedbackGiven === 'down'
                ? 'text-sai-red'
                : feedbackGiven === 'up'
                  ? 'text-ink-3/40 cursor-not-allowed'
                  : 'text-ink-3 hover:bg-hover-2 hover:text-ink-2'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={feedbackGiven === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" />
            </svg>
          </button>
          {showDislikePopover && (
            <div
              className="absolute right-0 bottom-full z-20 mb-2 w-60 rounded-[10px] bg-surface p-2 shadow-raised"
              style={{ animation: 'pop-in 180ms cubic-bezier(0.23,1,0.32,1) both' }}
            >
              <p className="px-1 pb-1.5 text-[12px] font-medium text-ink">What didn&apos;t you like?</p>
              <div className="space-y-0.5">
                {DISLIKE_REASONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setDislikeReason(r.key)}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors duration-100 ${
                      dislikeReason === r.key
                        ? 'bg-hover text-ink font-medium'
                        : 'text-ink-2 hover:bg-hover hover:text-ink'
                    }`}
                  >
                    <span className={`size-3.5 rounded-full border ${dislikeReason === r.key ? 'border-ink bg-ink/10' : 'border-line-strong'}`} />
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5 px-1">
                <button
                  type="button"
                  onClick={() => { setShowDislikePopover(false); setDislikeReason(null); }}
                  className="flex-1 rounded-[6px] border border-line py-1 text-[11px] text-ink-2 transition-colors hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDislikeSubmit}
                  disabled={!dislikeReason}
                  className="flex-1 rounded-[6px] bg-ink py-1 text-[11px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>

        {displayedSources.length > 0 && (
          <button
            type="button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((o) => !o)}
            className="ml-1.5 flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-150 hover:bg-hover"
          >
            <span className="flex -space-x-1">
              {displayedSources.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  className="size-3.5 rounded-full bg-ink/10 shadow-[0_0_0_1.5px_var(--canvas)] flex items-center justify-center"
                >
                  <svg width="7" height="7" viewBox="0 0 16 16" fill="var(--ink-3)">
                    <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077z"/>
                  </svg>
                </span>
              ))}
            </span>
            <span className="text-[12px] text-ink-2">{displayedSources.length} source{displayedSources.length !== 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

      {/* Sources drawer */}
      {displayedSources.length > 0 && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: done && sourcesOpen ? '1fr' : '0fr',
            opacity: done && sourcesOpen ? 1 : 0,
            transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        >
          <div className="overflow-hidden">
            <div className="mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
              {displayedSources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
                >
                  <span className="size-4 rounded-[4px] bg-ink/10 flex items-center justify-center shrink-0">
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="var(--ink-3)">
                      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
                    </svg>
                  </span>
                  <span className="animated-underline flex-1 min-w-0 truncate">{source.title || source.domain}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-ink-3 shrink-0">{source.domain}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <div
          className="mt-2.5 transition-opacity duration-400"
          style={{ opacity: done ? 1 : 0, pointerEvents: done ? 'auto' : 'none' }}
        >
          <p className="text-[12px] font-medium text-ink-2">Follow-ups</p>
          <div className="mt-0.5 flex flex-col">
            {followUps.map((fText, i) => (
              <button
                key={fText}
                className="-mx-1.5 flex items-center gap-2 rounded-[7px] border-b border-line
                  px-1.5 py-1.5 text-left text-[12.5px] text-ink transition-colors
                  duration-100 hover:bg-hover-2"
                style={
                  done
                    ? { animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both` }
                    : { opacity: 0 }
                }
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M9 10l-5 5 5 5" />
                  <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                </svg>
                {fText}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
