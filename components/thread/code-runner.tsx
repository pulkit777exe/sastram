'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Play, Loader2, X } from 'lucide-react';

// Runnable language sets — KISS: JS-family is executable via new Function, Python is placeholder
export const JS_LANGS = new Set([
  'js',
  'javascript',
  'jsx',
  'ts',
  'typescript',
  'tsx',
  'mjs',
  'cjs',
]);

export const PYTHON_LANGS = new Set(['py', 'python', 'python3', 'pyodide']);

export type RunSupport = 'js' | 'python' | 'unsupported';

export function getRunSupport(lang: string): RunSupport {
  const lower = lang.trim().toLowerCase();
  if (JS_LANGS.has(lower)) return 'js';
  if (PYTHON_LANGS.has(lower)) return 'python';
  return 'unsupported';
}

export function isRunnable(lang: string): boolean {
  return getRunSupport(lang) !== 'unsupported';
}

const MAX_OUTPUT_CHARS = 4000;

function stringifyValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n… [truncated]';
}

/**
 * Execute JS code client-side in a sandboxed manner.
 * - Only intended for client execution (never on server).
 * - Mocks console to capture log/warn/error/info.
 * - Returns captured output and error if thrown.
 * KISS: synchronous only, no Worker, no async handling.
 */
export function executeJs(code: string): { output: string; error: string | null } {
  const logs: string[] = [];

  const mockConsole = {
    log: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
    warn: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
    error: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
    info: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
    debug: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
  };

  try {
    // "use strict" prevents implicit globals; console is injected explicitly.
    // Using new Function is intentional for KISS client-only sandboxing — never called on server.
    const fn = new Function('console', `"use strict";\n${code}`);
    const result = fn(mockConsole);
    if (result !== undefined) {
      logs.push(stringifyValue(result));
    }
    const output = truncateOutput(logs.join('\n'));
    return { output, error: null };
  } catch (e) {
    const output = truncateOutput(logs.join('\n'));
    const message = e instanceof Error ? e.message : String(e);
    return { output, error: message };
  }
}

const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  cs: 'C#',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  graphql: 'GraphQL',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  md: 'Markdown',
  markdown: 'Markdown',
  diff: 'Diff',
  dockerfile: 'Dockerfile',
  prisma: 'Prisma',
};

interface CodeRunnerProps {
  lang: string;
  code: string;
}

export function CodeRunner({ lang, code }: CodeRunnerProps) {
  const [copied, setCopied] = React.useState(false);
  const [output, setOutput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [hasRun, setHasRun] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isPythonPlaceholder, setIsPythonPlaceholder] = React.useState(false);

  const support = getRunSupport(lang);
  const displayLang = LANG_DISPLAY[lang.toLowerCase()] ?? lang ?? '';
  const showRun = support !== 'unsupported';

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — leave idle.
    }
  }, [code]);

  const handleRun = React.useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    // Defer to next tick so the loading state paints before sync execution blocks.
    setTimeout(() => {
      if (support === 'python') {
        setOutput('');
        setError(null);
        setIsPythonPlaceholder(true);
        setHasRun(true);
        setIsRunning(false);
        return;
      }
      if (support === 'js') {
        const result = executeJs(code);
        setOutput(result.output);
        setError(result.error);
        setIsPythonPlaceholder(false);
        setHasRun(true);
        setIsRunning(false);
        return;
      }
      setIsRunning(false);
    }, 30);
  }, [code, support, isRunning]);

  const handleClear = React.useCallback(() => {
    setHasRun(false);
    setOutput('');
    setError(null);
    setIsPythonPlaceholder(false);
  }, []);

  return (
    <div
      className="my-2.5 animate-in fade-in duration-200 rounded-control overflow-hidden border border-line/60"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-line/40"
        style={{ background: 'var(--card)' }}
      >
        <span
          className="font-mono text-xs uppercase tracking-[0.12em] select-none"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {displayLang || 'code'}
        </span>
        <div className="flex items-center gap-1">
          {showRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRun}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs font-medium',
                support === 'js'
                  ? 'text-brand bg-brand/10 hover:bg-brand/15 hover:text-brand'
                  : 'text-muted-foreground bg-transparent',
                isRunning && 'opacity-70'
              )}
              aria-label={support === 'python' ? 'Run Python code' : 'Run code'}
            >
              {isRunning ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Play size={11} className="fill-current" />
              )}
              {isRunning ? 'Running' : 'Run'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs font-medium',
              copied ? 'text-emerald-600 bg-emerald-600/10' : 'text-muted-foreground bg-transparent'
            )}
            aria-label="Copy code"
          >
            <span className="t-icon-swap" data-state={copied ? 'b' : 'a'} style={{ display: 'inline-grid' }}>
              <svg
                data-icon="a"
                className="t-icon"
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <rect x="5" y="5" width="9" height="9" rx="2" />
                <path d="M11 5V3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              </svg>
              <svg
                data-icon="b"
                className="t-icon"
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 8l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <pre
        className="overflow-x-auto p-3 text-xs leading-[1.6] font-mono"
        style={{ color: 'var(--foreground)', background: 'var(--background)' }}
      >
        <code>{code}</code>
      </pre>
      {hasRun && (
        <div className="border-t border-line/40">
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ background: 'var(--muted)' }}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground">Output</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Clear output"
            >
              <X size={12} />
            </Button>
          </div>
          <div className="px-3 py-2.5" style={{ background: 'var(--muted)' }}>
            {isPythonPlaceholder ? (
              <div className="space-y-1">
                <p className="text-xs leading-relaxed text-ink-2">
                  Python execution is not yet supported in this preview.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Coming soon via Pyodide (WASM). For now, only JavaScript is runnable client-side.
                </p>
              </div>
            ) : error ? (
              <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-red-600 dark:text-red-400">
                {error}
                {output ? `\n${output}` : ''}
              </pre>
            ) : output ? (
              <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-foreground">
                {output}
              </pre>
            ) : (
              <span className="text-xs italic text-muted-foreground">No output</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
