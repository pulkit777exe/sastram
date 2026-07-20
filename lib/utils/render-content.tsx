'use client';

import React from 'react';

type MarkdownToken =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string }
  | { type: 'mention'; content: string };

function parseInlineCode(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`')) {
      tokens.push({ type: 'code', content: part.slice(1, -1) });
    } else if (part) {
      tokens.push({ type: 'text', content: part });
    }
  }
  return tokens;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Language display names for code fence labels
const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX',
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX',
  py: 'Python', python: 'Python',
  rb: 'Ruby', ruby: 'Ruby',
  go: 'Go',
  rs: 'Rust', rust: 'Rust',
  java: 'Java',
  cs: 'C#', csharp: 'C#',
  cpp: 'C++', c: 'C',
  html: 'HTML', css: 'CSS', scss: 'SCSS',
  json: 'JSON', yaml: 'YAML', toml: 'TOML',
  sql: 'SQL', graphql: 'GraphQL',
  sh: 'Shell', bash: 'Bash', zsh: 'Zsh',
  md: 'Markdown', markdown: 'Markdown',
  diff: 'Diff', dockerfile: 'Dockerfile',
  prisma: 'Prisma',
};

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // silent
    }
  }, [code]);

  const displayLang = LANG_DISPLAY[lang.toLowerCase()] ?? (lang || null);

  return (
    <div
      className="my-2.5 animate-in fade-in duration-200 rounded-[10px] overflow-hidden border border-border/60"
      style={{ background: 'var(--bg)' }}
    >
      {/* Code block header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-border/40"
        style={{ background: 'var(--surface)' }}
      >
        {displayLang ? (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] select-none"
            style={{ color: 'var(--muted)' }}
          >
            {displayLang}
          </span>
        ) : (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] select-none"
            style={{ color: 'var(--muted)' }}
          >
            code
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[10px] font-medium transition-all duration-150"
          style={{
            color: copied ? 'var(--green)' : 'var(--muted)',
            background: copied ? 'rgba(26,156,92,0.08)' : 'transparent',
          }}
          aria-label="Copy code"
        >
          <span
            className="t-icon-swap"
            data-state={copied ? 'b' : 'a'}
            style={{ display: 'inline-grid' }}
          >
            {/* Copy icon */}
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
            {/* Check icon */}
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
        </button>
      </div>
      {/* Code content */}
      <pre
        className="overflow-x-auto p-3 text-[12.5px] leading-[1.6] font-mono"
        style={{ color: 'var(--text)', background: 'var(--bg)' }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderTextWithFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const mentionMatch = remaining.match(/@\w[\w.-]*/);

    const matches = [
      boldMatch && { type: 'bold' as const, match: boldMatch, index: boldMatch.index! },
      italicMatch && { type: 'italic' as const, match: italicMatch, index: italicMatch.index! },
      linkMatch && { type: 'link' as const, match: linkMatch, index: linkMatch.index! },
      mentionMatch && { type: 'mention' as const, match: mentionMatch, index: mentionMatch.index! },
    ].filter(Boolean) as Array<{ type: string; match: RegExpMatchArray; index: number }>;

    if (matches.length === 0) {
      nodes.push(remaining);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    if (earliest.index > 0) {
      nodes.push(remaining.slice(0, earliest.index));
    }

    const matchText = earliest.match[0];
    keyCounter++;

    if (earliest.type === 'bold') {
      nodes.push(
        <strong key={`${keyPrefix}-b${keyCounter}`} className="font-semibold">
          {renderTextWithFormatting(earliest.match[1], `${keyPrefix}-b${keyCounter}`)}
        </strong>
      );
    } else if (earliest.type === 'italic') {
      nodes.push(
        <em key={`${keyPrefix}-i${keyCounter}`}>
          {renderTextWithFormatting(earliest.match[1], `${keyPrefix}-i${keyCounter}`)}
        </em>
      );
    } else if (earliest.type === 'link') {
      const linkText = earliest.match[1];
      const url = earliest.match[2];
      if (isSafeUrl(url)) {
        nodes.push(
          <a
            key={`${keyPrefix}-a${keyCounter}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors"
            style={{ color: 'var(--blue)' }}
          >
            {linkText}
          </a>
        );
      } else {
        nodes.push(`[${linkText}](${url})`);
      }
    } else if (earliest.type === 'mention') {
      // Mention pill — uses brand tokens, reads as a person reference not a tag
      nodes.push(
        <span
          key={`${keyPrefix}-m${keyCounter}`}
          className="inline-flex items-center gap-0.5 rounded-[5px] px-1.5 py-0 align-baseline text-[0.9em] font-semibold leading-[1.6] cursor-default"
          style={{
            background: 'var(--blue-dim)',
            color: 'var(--blue)',
          }}
          title={matchText}
        >
          {matchText}
        </span>
      );
    }

    remaining = remaining.slice(earliest.index + matchText.length);
  }

  return nodes;
}

export function renderContent(content: string): React.ReactNode {
  if (!content) return null;

  // Split by fenced code blocks — capture the language identifier
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const segments: Array<
    | { type: 'text'; content: string }
    | { type: 'codeblock'; lang: string; code: string }
  > = [];
  let lastIndex = 0;

  for (const match of content.matchAll(codeBlockRegex)) {
    if (match.index! > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index!) });
    }
    const lang = (match[1] || '').trim();
    const code = (match[2] || '').trimEnd();
    segments.push({ type: 'codeblock', lang, code });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content });
  }

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'codeblock') {
          return <CodeBlock key={`cb-${i}`} lang={segment.lang} code={segment.code} />;
        }

        const inlineTokens = parseInlineCode(segment.content);
        return (
          <React.Fragment key={`t-${i}`}>
            {inlineTokens.map((token, j) => {
              if (token.type === 'code') {
                return (
                  <code
                    key={`ic-${i}-${j}`}
                    className="rounded-[4px] px-1.5 py-0.5 text-[0.88em] font-mono"
                    style={{
                      background: 'var(--blue-dim)',
                      color: 'var(--blue)',
                    }}
                  >
                    {token.content}
                  </code>
                );
              }
              return renderTextWithFormatting(token.content, `tx-${i}-${j}`);
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}
