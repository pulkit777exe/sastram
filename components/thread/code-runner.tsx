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
 * Execute JS code in a Worker sandbox to avoid blocking the main thread.
 * - No unsafe-eval on main thread; user code runs inside Worker via new Function.
 * - Captures console output via postMessage.
 * - 3s timeout terminates Worker to prevent infinite loops.
 * - Falls back to main-thread execution if Worker unavailable.
 */
export async function executeJs(code: string): Promise<{ output: string; error: string | null }> {
  if (typeof window === 'undefined') {
    return { output: '', error: 'Execution unavailable (no window)' };
  }

  function fallbackSync(): { output: string; error: string | null } {
    const logs: string[] = [];
    const mockConsole = {
      log: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
      warn: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
      error: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
      info: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
      debug: (...args: unknown[]) => logs.push(args.map(stringifyValue).join(' ')),
    };
    try {
      const fn = new Function('console', `"use strict";\n${code}`);
      const result = fn(mockConsole);
      if (result !== undefined) logs.push(stringifyValue(result));
      return { output: truncateOutput(logs.join('\n')), error: null };
    } catch (e) {
      return { output: truncateOutput(logs.join('\n')), error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (typeof Worker === 'undefined') {
    return fallbackSync();
  }

  let worker: Worker | null = null;
  let url: string | null = null;

  try {
    const workerCode = `
const logs=[];
function stringifyValue(v){
  if(v===null)return'null';
  if(v===undefined)return'undefined';
  if(typeof v==='string')return v;
  if(typeof v==='number'||typeof v==='boolean'||typeof v==='bigint')return String(v);
  try{return JSON.stringify(v,null,2)??String(v);}catch{return String(v);}
}
const mockConsole={
  log(...a){logs.push(a.map(stringifyValue).join(' '))},
  warn(...a){logs.push(a.map(stringifyValue).join(' '))},
  error(...a){logs.push(a.map(stringifyValue).join(' '))},
  info(...a){logs.push(a.map(stringifyValue).join(' '))},
  debug(...a){logs.push(a.map(stringifyValue).join(' '))},
};
self.onmessage=async(e)=>{
  const code=e.data&&e.data.code||'';
  try{
    const fn=new Function('console','"use strict";\\n'+code);
    const result=fn(mockConsole);
    const awaited=result&&typeof result.then==='function'?await result:result;
    if(awaited!==undefined)logs.push(stringifyValue(awaited));
    self.postMessage({output:logs.join('\\n'),error:null});
  }catch(err){
    self.postMessage({output:logs.join('\\n'),error:err&&err.message?err.message:String(err)});
  }
};
`;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    url = URL.createObjectURL(blob);
    worker = new Worker(url);
  } catch {
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    return fallbackSync();
  }

  return new Promise((resolve) => {
    let settled = false;
    // eslint-disable-next-line prefer-const
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (worker) {
        try {
          worker.terminate();
        } catch {}
        worker = null;
      }
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        url = null;
      }
    };

    const done = (res: { output: string; error: string | null }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ output: truncateOutput(res.output), error: res.error });
    };

    timeoutId = setTimeout(() => {
      done({ output: '', error: 'Execution timeout (3s)' });
    }, 3000);

    worker!.onmessage = (e: MessageEvent<{ output: string; error: string | null }>) => {
      done({ output: e.data?.output ?? '', error: e.data?.error ?? null });
    };

    worker!.onerror = (e: ErrorEvent) => {
      done({ output: '', error: e.message || 'Worker error' });
    };

    try {
      worker!.postMessage({ code });
    } catch (e) {
      done({ output: '', error: e instanceof Error ? e.message : String(e) });
    }
  });
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

let cachedPyodide: unknown = null;
let pyodideLoadPromise: Promise<unknown> | null = null;

async function loadPyodideSafely(): Promise<unknown> {
  if (cachedPyodide) return cachedPyodide;
  if (pyodideLoadPromise) return pyodideLoadPromise;
  if (typeof window === 'undefined') throw new Error('No window');
  const existing = (window as unknown as { loadPyodide?: () => Promise<unknown> }).loadPyodide;
  if (existing) {
    pyodideLoadPromise = existing().then((p) => {
      cachedPyodide = p;
      return p;
    });
    return pyodideLoadPromise;
  }
  pyodideLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.28.0/full/pyodide.js';
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error('Pyodide load timeout'));
    }, 15000);
    script.onload = async () => {
      clearTimeout(timeout);
      try {
        const loader = (window as unknown as { loadPyodide?: () => Promise<unknown> }).loadPyodide;
        if (!loader) throw new Error('loadPyodide not found after script load');
        const py = await loader();
        cachedPyodide = py;
        resolve(py);
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load Pyodide script'));
    };
    document.head.appendChild(script);
  });
  try {
    const result = await pyodideLoadPromise;
    return result;
  } catch (e) {
    pyodideLoadPromise = null;
    throw e;
  }
}

async function executePython(code: string): Promise<{ output: string; error: string | null }> {
  const timeoutMs = 8000;
  function withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Python execution timeout (8s)')), timeoutMs))]);
  }
  try {
    const py = (await withTimeout(loadPyodideSafely())) as {
      runPythonAsync: (c: string) => Promise<unknown>;
      setStdout?: (opts: { batched: (s: string) => void }) => void;
      setStderr?: (opts: { batched: (s: string) => void }) => void;
    };
    const logs: string[] = [];
    try {
      py.setStdout?.({ batched: (s: string) => logs.push(s) });
      py.setStderr?.({ batched: (s: string) => logs.push(s) });
    } catch {
      // ignore if not supported
    }
    let result: unknown = null;
    try {
      result = await withTimeout(py.runPythonAsync(code) as Promise<unknown>);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const out = truncateOutput(logs.join('\n'));
      return { output: out, error: msg };
    }
    const captured = logs.join('\n');
    const extra = result !== undefined && result !== null ? stringifyValue(result) : '';
    const combined = [captured, extra].filter(Boolean).join('\n');
    return { output: truncateOutput(combined), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('timeout') || msg.includes('Failed to load')) {
      return { output: '', error: `Python unavailable: ${msg}. Check network and try again.` };
    }
    return { output: '', error: msg };
  }
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
    setTimeout(async () => {
      try {
        if (support === 'python') {
          setIsPythonPlaceholder(false);
          const result = await executePython(code);
          setOutput(result.output);
          setError(result.error);
          setHasRun(true);
          setIsRunning(false);
          return;
        }
        if (support === 'js') {
          const result = await executeJs(code);
          setOutput(result.output);
          setError(result.error);
          setIsPythonPlaceholder(false);
          setHasRun(true);
          setIsRunning(false);
          return;
        }
        setIsRunning(false);
      } catch (e) {
        setOutput('');
        setError(e instanceof Error ? e.message : String(e));
        setHasRun(true);
        setIsRunning(false);
      }
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
