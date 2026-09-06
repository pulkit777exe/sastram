import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { getCollection } from '@/modules/collections/repository';

export const GET = withErrorHandling(async (_: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const session = await requireSessionOrThrow();
  const { id } = await context!.params;
  const collection = await getCollection(id, session.user.id);
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: HTTP_STATUS.NOT_FOUND });

  let md = `# ${collection.title}\n\n`;
  for (const item of collection.items) {
    if (item.thread) md += `## [${item.thread.name}](/dashboard/threads/${item.thread.slug})\n`;
    if (item.session) md += `## ${item.session.title ?? item.session.query}\n${item.session.query}\n`;
  }

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${collection.title}.md"`,
    },
  });
});
