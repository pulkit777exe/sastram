import { NextRequest, NextResponse } from 'next/server';
import { fail, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection } from '@/modules/collections/repository';
import { withCollectionsHandler, parseRouteId } from '@/modules/collections/handler';
import { collectionIdSchema } from '@/modules/collections/schemas';
import { toMarkdown } from '@/modules/collections/metadata';
import { renderCitationSources } from '@/modules/ai-search/citations';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 80) || 'collection';
}

function escapeMd(s: string): string {
  return s.replace(/\r\n/g, '\n').trim();
}

export const GET = withCollectionsHandler(async (_: NextRequest, session, context) => {
  const id = await parseRouteId(context, collectionIdSchema);
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
        const lines = renderCitationSources(
          (result.citations as { marker: number; sourceId: string }[]) ?? [],
          (result.sources as { id: string; title: string; url: string; domain: string; tier: number; confidence: number; provider: string; isOutdated?: boolean; contentFetched?: boolean }[]) ?? []
        );
        if (lines.length) md += `\n**Sources**\n\n${lines.join('\n')}\n`;
      } else {
        md += `_${escapeMd(item.session.query)}_\n`;
      }
      md += `\n`;
    }
    const msg = (item as unknown as { message?: { content: string; isAiResponse: boolean; thread?: { name: string; slug: string } | null } }).message;
    if (msg) {
      md += `## ${msg.isAiResponse ? 'AI Response' : 'Message'} — ${msg.thread ? `[${escapeMd(msg.thread.name)}](/dashboard/threads/${msg.thread.slug})` : 'Thread'}\n\n${escapeMd(msg.content.slice(0, 2000))}\n\n`;
    }
    md += toMarkdown(item.metadata);
  }

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(collection.title)}.md"`,
    },
  });
});
