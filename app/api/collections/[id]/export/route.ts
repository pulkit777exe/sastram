import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection } from '@/modules/collections/repository';
import { isCollectionsEnabled } from '@/modules/collections/enabled';
import { rateLimit } from '@/lib/services/rate-limit';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 80) || 'collection';
}

function escapeMd(s: string): string {
  return s.replace(/\r\n/g, '\n').trim();
}

export const GET = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const rl = await rateLimit({ key: `collections:${session.user.id}`, type: 'api' });
  if (!rl.success) return NextResponse.json(fail('RATE_LIMITED', 'Too many requests'), { status: HTTP_STATUS.RATE_LIMITED });
  if (!(await isCollectionsEnabled(session.user.id))) {
    return NextResponse.json(fail('FEATURE_DISABLED', 'Collections is disabled'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const { id } = await context!.params;
  const collection = await getCollection(id, session.user.id, { take: 100 });
  if (!collection) return NextResponse.json(fail('NOT_FOUND', 'Collection not found'), { status: HTTP_STATUS.NOT_FOUND });

  let md = `# ${escapeMd(collection.title)}\n\n`;
  for (const item of collection.items) {
    if (item.thread) md += `## [${escapeMd(item.thread.name)}](/dashboard/threads/${item.thread.slug})\n\n${item.thread.aiSummary ? `${escapeMd(item.thread.aiSummary.slice(0, 800))}\n\n` : ''}`;
    if (item.session) {
      const title = escapeMd(item.session.title ?? item.session.query);
      md += `## ${title}\n\n> Query: ${escapeMd(item.session.query)}\n\n`;
      const result = (item.session as unknown as { results?: { synthesis: string; citations: { marker: number; sourceId: string }[]; sources: { id: string; title: string; url: string; domain: string; tier: number; confidence: number; provider: string; isOutdated?: boolean; contentFetched?: boolean }[] }[] }).results?.[0];
      if (result?.synthesis) {
        md += `${result.synthesis.trim()}\n`;
        const citations = (result.citations as { marker: number; sourceId: string }[]) ?? [];
        const sources = (result.sources as { id: string; title: string; url: string; domain: string; tier: number; confidence: number; provider: string; isOutdated?: boolean; contentFetched?: boolean }[]) ?? [];
        if (citations.length && sources.length) {
          const byId = new Map(sources.map((s) => [s.id, s]));
          const sorted = [...citations].sort((a, b) => a.marker - b.marker);
          const lines = sorted
            .map((c) => {
              const s = byId.get(c.sourceId);
              if (!s) return null;
              return `[${c.marker}] ${s.title || s.domain} — ${s.url} (${s.domain} · T${s.tier} · ${s.provider} · ${Math.round(s.confidence)}%${s.isOutdated ? ' · outdated' : ''}${s.contentFetched === false ? ' · snippet only' : ''})`;
            })
            .filter(Boolean) as string[];
          if (lines.length) md += `\n**Sources**\n\n${lines.join('\n')}\n`;
        }
      } else {
        md += `_${escapeMd(item.session.query)}_\n`;
      }
      md += `\n`;
    }
    const msg = (item as unknown as { message?: { content: string; isAiResponse: boolean; thread?: { name: string; slug: string } | null } }).message;
    if (msg) {
      md += `## ${msg.isAiResponse ? 'AI Response' : 'Message'} — ${msg.thread ? `[${escapeMd(msg.thread.name)}](/dashboard/threads/${msg.thread.slug})` : 'Thread'}\n\n${escapeMd(msg.content.slice(0, 2000))}\n\n`;
    }
    const meta = (item as unknown as { metadata?: Record<string, unknown> | null }).metadata;
    if (meta && typeof meta === 'object') {
      const t = (meta as Record<string, unknown>).type as string | undefined;
      if (t === 'graph') {
        md += `## Graph Snapshot\n\nNodes: ${((meta as Record<string, unknown>).nodes as unknown[])?.length ?? 0}, Edges: ${((meta as Record<string, unknown>).links as unknown[])?.length ?? 0}\n\n`;
      } else if (t === 'canvas') {
        md += `## Canvas — ${escapeMd(String((meta as Record<string, unknown>).leftName ?? ''))} vs ${escapeMd(String((meta as Record<string, unknown>).rightName ?? ''))}\n\n${(meta as Record<string, unknown>).diff ? escapeMd(String((meta as Record<string, unknown>).diff)) : ''}\n\n`;
      } else if (t === 'summary') {
        md += `## Summary\n\n${escapeMd(String((meta as Record<string, unknown>).content ?? ''))}\n\n`;
      } else if (t === 'ai_synthesis') {
        md += `## AI Synthesis\n\n${escapeMd(String((meta as Record<string, unknown>).text ?? ''))}\n\n`;
      }
    }
  }

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(collection.title)}.md"`,
    },
  });
});
