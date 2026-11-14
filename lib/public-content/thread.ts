import 'server-only';

import { prisma } from '@/lib/infrastructure/prisma';
import { cache } from 'react';

export const PUBLIC_REVALIDATE_SECONDS = 300;

export type PublicThread = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  aiSummary: string | null;
  resolutionScore: number | null;
  isOutdated: boolean;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; image: string | null } | null;
  tags: Array<{ tag: { id: string; name: string; slug: string } }>;
  _count: { messages: number };
};

export type PublicThreadClaim = {
  id: string;
  messageId: string;
  position: number;
  text: string;
  status: 'OPEN' | 'CONFIRMED' | 'DISPUTED' | 'CONTESTED';
  sourceLabel: string | null;
  sourceUrl: string | null;
  excerpt: string | null;
  confidence: number | null;
  confirmCount: number;
  disputeCount: number;
};

export type PublicThreadMessage = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  isPinned: boolean;
  isAI: boolean;
  senderId: string | null;
  author: { id: string; name: string | null; image: string | null } | null;
  claims?: PublicThreadClaim[];
};

export const getPublicThreadBySlug = cache(async (slug: string): Promise<PublicThread | null> => {
  const thread = await prisma.thread.findFirst({
    where: { slug, visibility: 'PUBLIC', deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      aiSummary: true,
      resolutionScore: true,
      isOutdated: true,
      verifiedAt: true,
      verifiedBy: true,
      lastVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
      creator: { select: { id: true, name: true, image: true } },
      tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });
  if (!thread) return null;
  const { creator, ...rest } = thread;
  return { ...rest, author: creator } as PublicThread;
});

export async function getPublicThreadMessages(threadId: string, limit = 50): Promise<PublicThreadMessage[]> {
  const rows = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      isEdited: true,
      isPinned: true,
      isAiResponse: true,
      senderId: true,
      sender: { select: { id: true, name: true, image: true } },
      claims: {
        select: {
          id: true,
          messageId: true,
          position: true,
          text: true,
          status: true,
          sourceLabel: true,
          sourceUrl: true,
          excerpt: true,
          confidence: true,
          confirmCount: true,
          disputeCount: true,
        },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((m) => ({
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    isEdited: m.isEdited,
    isPinned: m.isPinned,
    isAI: m.isAiResponse,
    senderId: m.senderId,
    author: m.sender ?? null,
    claims: (m.claims ?? []).map((c) => ({
      id: c.id,
      messageId: c.messageId,
      position: c.position,
      text: c.text,
      status: c.status,
      sourceLabel: c.sourceLabel,
      sourceUrl: c.sourceUrl,
      excerpt: c.excerpt,
      confidence: c.confidence,
      confirmCount: c.confirmCount,
      disputeCount: c.disputeCount,
    })),
  }));
}

export const getPublicKnowledgeBySlug = cache(async (slug: string) => {
  return prisma.knowledgePage.findFirst({
    where: {
      thread: { slug, visibility: 'PUBLIC', deletedAt: null, isOutdated: false, verifiedAt: { not: null } },
    },
    select: {
      id: true,
      version: true,
      synthesizedContent: true,
      updatedAt: true,
      thread: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          aiSummary: true,
          resolutionScore: true,
          verifiedAt: true,
          lastVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: { where: { deletedAt: null } } } },
        },
      },
    },
  });
});

export async function getPendingReportCount(threadId: string): Promise<number> {
  return prisma.report.count({
    where: { status: 'PENDING', message: { threadId } },
  });
}

export function shouldNoIndexThread(
  thread: Pick<PublicThread, 'verifiedAt' | 'resolutionScore' | 'aiSummary' | '_count'>,
  pendingReports: number
): boolean {
  if (pendingReports > 0) return true;
  const hasQualityContent = Boolean(thread.aiSummary?.trim()) || thread._count.messages >= 2;
  if (!hasQualityContent) return true;
  const isResolved = thread.verifiedAt != null || (thread.resolutionScore ?? 0) > 70;
  if (!isResolved) return true;
  return false;
}
