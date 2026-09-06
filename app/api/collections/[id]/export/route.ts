import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection } from '@/modules/collections/repository';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 80) || 'collection';
}

function escapeMd(s: string): string {
  return s.replace(/\r\n/g, '\n').trim();
}

export const GET = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { id } = await context!.params;
  const collection = await getCollection(id, session.user.id);
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: HTTP_STATUS.NOT_FOUND });

  let md = `# ${escapeMd(collection.title)}\n\n`;
  for (const item of collection.items) {
    if (item.thread) md += `## [${escapeMd(item.thread.name)}](/dashboard/threads/${item.thread.slug})\n\n`;
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
  }

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(collection.title)}.md"`,
    },
  });
});
