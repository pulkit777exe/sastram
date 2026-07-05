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

function renderTextWithFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  while (remaining.length > 0) {
    // Match bold, italic, link, or mention — find the earliest match
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const mentionMatch = remaining.match(/@\w+/);

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

    // Pick the earliest match
    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    // Add text before the match
    if (earliest.index > 0) {
      nodes.push(remaining.slice(0, earliest.index));
    }

    const matchText = earliest.match[0];

    if (earliest.type === 'bold') {
      const inner = earliest.match[1];
      keyCounter++;
      nodes.push(
        <strong key={`${keyPrefix}-b${keyCounter}`} className="font-semibold">
          {renderTextWithFormatting(inner, `${keyPrefix}-b${keyCounter}`)}
        </strong>
      );
    } else if (earliest.type === 'italic') {
      const inner = earliest.match[1];
      keyCounter++;
      nodes.push(
        <em key={`${keyPrefix}-i${keyCounter}`}>
          {renderTextWithFormatting(inner, `${keyPrefix}-i${keyCounter}`)}
        </em>
      );
    } else if (earliest.type === 'link') {
      const linkText = earliest.match[1];
      const url = earliest.match[2];
      keyCounter++;
      if (isSafeUrl(url)) {
        nodes.push(
          <a
            key={`${keyPrefix}-a${keyCounter}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {linkText}
          </a>
        );
      } else {
        nodes.push(`[${linkText}](${url})`);
      }
    } else if (earliest.type === 'mention') {
      keyCounter++;
      nodes.push(
        <span
          key={`${keyPrefix}-m${keyCounter}`}
          className="bg-blue-50 text-blue-600 rounded px-0.5 font-medium dark:bg-blue-950/30 dark:text-blue-400"
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

  // Split by fenced code blocks (```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const segments: Array<{ type: 'text' | 'codeblock'; content: string }> = [];
  let lastIndex = 0;

  for (const match of content.matchAll(codeBlockRegex)) {
    if (match.index! > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index!) });
    }
    // Extract code content between ``` markers
    const block = match[0];
    const codeContent = block.slice(3, -3).replace(/^\w+\n/, ''); // Strip language identifier
    segments.push({ type: 'codeblock', content: codeContent });
    lastIndex = match.index! + block.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  // If no code blocks found, treat entire content as text
  if (segments.length === 0) {
    segments.push({ type: 'text', content });
  }

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'codeblock') {
          return (
            <pre key={`cb-${i}`} className="my-2 rounded-lg bg-muted/50 p-3 text-[13px] overflow-x-auto">
              <code className="font-mono text-foreground/90">{segment.content}</code>
            </pre>
          );
        }

        // Parse inline code first, then apply other formatting to non-code parts
        const inlineTokens = parseInlineCode(segment.content);
        return (
          <React.Fragment key={`t-${i}`}>
            {inlineTokens.map((token, j) => {
              if (token.type === 'code') {
                return (
                  <code
                    key={`ic-${i}-${j}`}
                    className="rounded bg-muted/60 px-1.5 py-0.5 text-[13px] font-mono text-foreground/80"
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
