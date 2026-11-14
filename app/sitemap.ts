import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/infrastructure/prisma';
import { shouldNoIndexThread } from '@/lib/public-content/thread';

const PAGE_SIZE = 1000;

type SitemapId = 'static' | `threads-${number}` | `knowledge-${number}`;

function siteUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function generateSitemaps() {
  const [threadCount, knowledgeCount] = await Promise.all([
    prisma.thread.count({ where: { visibility: 'PUBLIC', deletedAt: null } }),
    prisma.knowledgePage.count({
      where: { thread: { visibility: 'PUBLIC', deletedAt: null, isOutdated: false, verifiedAt: { not: null } } },
    }),
  ]);
  const threadPages = Math.max(1, Math.ceil(threadCount / PAGE_SIZE));
  const knowledgePages = Math.max(1, Math.ceil(knowledgeCount / PAGE_SIZE));
  const ids: Array<{ id: string }> = [{ id: 'static' }];
  for (let i = 0; i < threadPages; i++) ids.push({ id: `threads-${i}` });
  for (let i = 0; i < knowledgePages; i++) ids.push({ id: `knowledge-${i}` });
  return ids;
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = (await props.id) as SitemapId;
  const base = siteUrl();
  const now = new Date();

  if (id === 'static') {
    return [
      { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
      { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
      { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ];
  }

  if (id.startsWith('threads-')) {
    const page = Number(id.split('-')[1] || 0);
    const threads = await prisma.thread.findMany({
      where: { visibility: 'PUBLIC', deletedAt: null },
      select: {
        slug: true,
        updatedAt: true,
        aiSummary: true,
        verifiedAt: true,
        resolutionScore: true,
        _count: {
          select: {
            messages: { where: { deletedAt: null } },
            // pending reports cannot be counted directly here; approximate by excluding known-low-quality fields below
          },
        },
        messages: { where: { reports: { some: { status: 'PENDING' } } }, select: { id: true }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return threads
      .filter((t) => !shouldNoIndexThread(
        {
          verifiedAt: t.verifiedAt,
          resolutionScore: t.resolutionScore,
          aiSummary: t.aiSummary,
          _count: { messages: t._count.messages },
        } as never,
        t.messages.length
      ))
      .map((t) => ({
        url: `${base}/q/${t.slug}`,
        lastModified: t.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: t.verifiedAt ? 0.8 : 0.5,
      }));
  }

  if (id.startsWith('knowledge-')) {
    const page = Number(id.split('-')[1] || 0);
    const pages = await prisma.knowledgePage.findMany({
      where: { thread: { visibility: 'PUBLIC', deletedAt: null, isOutdated: false, verifiedAt: { not: null } } },
      select: {
        updatedAt: true,
        thread: { select: { slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return pages.map((p) => ({
      url: `${base}/k/${p.thread.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));
  }

  return [];
}
