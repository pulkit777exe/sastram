'use client';

import React from 'react';
import { CodeRunner } from '@/components/thread/code-runner';

// Inline formatting regexes — named constants with comments for readability
// Matches complete **bold** pairs — a lone '**' during streaming is left as-is
const BOLD_RE = /\*\*(.+?)\*\*/;
// Matches inline `code` segments
const INLINE_CODE_RE = /`([^`]+)`/;
// Matches markdown links [text](url)
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;
// Matches @mentions like @username
const MENTION_RE = /@\w[\w.-]*/;
// Fenced code blocks — captures optional lang and code body
const CODE_BLOCK_RE = /```(\w*)\n?([\s\S]*?)```/g;

type MarkdownToken = { type: 'text'; content: string } | { type: 'code'; content: string };

// Explicit parser for inline code segments — avoids inline split with capture group
// Parses text into segments, keeping `code` delimiters as separate entries
function splitByInlineCode(text: string): string[] {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openIndex = text.indexOf('`', cursor);
    if (openIndex === -1) {
      parts.push(text.slice(cursor));
      break;
    }

    const closeIndex = text.indexOf('`', openIndex + 1);
    // Empty code `` or unclosed ` -> treat opening char as plain text
    if (closeIndex === -1 || closeIndex === openIndex + 1) {
      parts.push(text.slice(cursor, openIndex + 1));
      cursor = openIndex + 1;
      continue;
    }

    if (openIndex > cursor) {
      parts.push(text.slice(cursor, openIndex));
    }
    parts.push(text.slice(openIndex, closeIndex + 1));
    cursor = closeIndex + 1;
  }

  return parts.filter((part) => part.length > 0);
}

function parseInlineCode(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = [];
  const parts = splitByInlineCode(text);
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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return <CodeRunner lang={lang} code={code} />;
}

type MatchCandidate = { type: string; match: RegExpMatchArray; index: number };

// Helper: find earliest match among bold, code, link, mention — explicit loop, no sort
function findEarliestMatch(remaining: string): MatchCandidate | null {
  const candidates: MatchCandidate[] = [];

  const boldMatch = remaining.match(BOLD_RE);
  if (boldMatch && boldMatch.index !== undefined) {
    candidates.push({ type: 'bold', match: boldMatch, index: boldMatch.index });
  }

  const codeMatch = remaining.match(INLINE_CODE_RE);
  if (codeMatch && codeMatch.index !== undefined) {
    candidates.push({ type: 'code', match: codeMatch, index: codeMatch.index });
  }

  const linkMatch = remaining.match(LINK_RE);
  if (linkMatch && linkMatch.index !== undefined) {
    candidates.push({ type: 'link', match: linkMatch, index: linkMatch.index });
  }

  const mentionMatch = remaining.match(MENTION_RE);
  if (mentionMatch && mentionMatch.index !== undefined) {
    candidates.push({ type: 'mention', match: mentionMatch, index: mentionMatch.index });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Explicit loop to find smallest index — KISS over sort
  let earliest = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].index < earliest.index) {
      earliest = candidates[i];
    }
  }
  return earliest;
}

function renderTextWithFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    const earliest = findEarliestMatch(remaining);

    if (!earliest) {
      nodes.push(remaining);
      break;
    }

    // Push any text before the match — strips lone '**' fragments naturally
    // because they won't match the regex and will fall through to here.
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
    } else if (earliest.type === 'code') {
      nodes.push(
        <code
          key={`${keyPrefix}-c${keyCounter}`}
          className="rounded-sm px-1.5 py-0.5 text-[0.88em] font-mono bg-brand/10 text-brand"
        >
          {earliest.match[1]}
        </code>
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
            style={{ color: 'var(--brand)' }}
          >
            {linkText}
          </a>
        );
      } else {
        nodes.push(`[${linkText}](${url})`);
      }
    } else if (earliest.type === 'mention') {
      nodes.push(
        <span
          key={`${keyPrefix}-m${keyCounter}`}
          className="inline-flex items-center gap-0.5 rounded-control px-1.5 py-0 align-baseline text-[0.9em] font-semibold leading-[1.6] cursor-default bg-brand/10 text-brand"
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

  // Fenced blocks are split out first so their contents skip inline formatting.
  // Uses named constant CODE_BLOCK_RE — captures optional language and code body
  const codeBlockRegex = new RegExp(CODE_BLOCK_RE.source, CODE_BLOCK_RE.flags);
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
                    className="rounded-sm px-1.5 py-0.5 text-[0.88em] font-mono bg-brand/10 text-brand"
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
