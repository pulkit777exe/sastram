import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { dedupe } from '@/lib/dedupe';
import { buildThreadDTO, buildThreadDetailDTO } from '@/modules/threads/service';
import type { ThreadDetail, ThreadRecord, ThreadSummary } from '@/modules/threads/types';

type ThreadStorageWithCommunityAndCount = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: { select: { senderId: true } };
    _count: { select: { messages: true; members: true } };
  };
}>;

type ThreadStorageWithFullDetails = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: {
      include: {
        sender: {
          select: {
            id: true;
            name: true;
            image: true;
          };
        };
        attachments: true;
      };
    };
    subscriptions: true;
    _count: { select: { messages: true } };
  };
}>;

export interface ListThreadsParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'recent' | 'popular' | 'trending' | 'oldest';
  memberUserId?: string;
}

export interface PaginatedThreads {
  threads: ThreadSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function listThreads(params: ListThreadsParams = {}): Promise<PaginatedThreads> {
  const { page = 1, pageSize = 10, sortBy = 'recent', memberUserId } = params;
  const skip = (page - 1) * pageSize;

  const where = memberUserId
    ? { members: { some: { userId: memberUserId } } }
    : {};

  try {
    const [totalItems, threadRows] = await dedupe(`threads:list:${page}:${pageSize}:${sortBy}:${memberUserId ?? ''}`, () =>
      Promise.all([
        prisma.section.count({ where }),
        prisma.section.findMany({
          where,
          include: {
            community: true,
            messages: {
              where: {
                deletedAt: null,
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
              select: {
                senderId: true,
                createdAt: true,
              },
            },
            members: {
              where: {
                status: 'ACTIVE',
              },
            },
            _count: {
              select: {
                messages: {
                  where: {
                    deletedAt: null,
                  },
                },
                members: {
                  where: {
                    status: 'ACTIVE',
                  },
                },
              },
            },
          },
          orderBy:
            sortBy === 'oldest'
              ? { createdAt: 'asc' }
              : sortBy === 'popular'
                ? { messageCount: 'desc' }
                : { updatedAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ])
    );

    let mappedThreads = (threadRows ?? []).map((thread: ThreadStorageWithCommunityAndCount) => {
      const uniqueActiveUsers = new Set(thread.messages.map((message) => message.senderId));
      return buildThreadDTO(
        thread as unknown as ThreadRecord,
        thread._count.messages,
        uniqueActiveUsers.size,
        thread._count.members
      );
    });

    if (sortBy === 'trending') {
      mappedThreads = mappedThreads.sort((a, b) => {
        const scoreA = a.activeUsers * 2 + a.messageCount;
        const scoreB = b.activeUsers * 2 + b.messageCount;
        return scoreB - scoreA;
      });
    }

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      threads: mappedThreads,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    logger.error('[listThreads]', error);
    return {
      threads: [],
      pagination: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      },
    };
  }
}

export async function getThreadBySlug(slug: string): Promise<ThreadDetail | null> {
  const row = await dedupe(`threads:bySlug:${slug}`, () =>
    prisma.section.findFirst({
      where: {
        slug,
      },
      include: {
        community: true,
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            attachments: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        subscriptions: true,
        _count: {
          select: {
            messages: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    })
  );

  if (!row) {
    return null;
  }

  const typedRow = row as ThreadStorageWithFullDetails;

  const memberCount = await prisma.sectionMember.count({
    where: {
      sectionId: typedRow.id,
      status: 'ACTIVE',
    },
  });

  return buildThreadDetailDTO(
    typedRow as unknown as ThreadRecord,
    typedRow._count.messages,
    new Set(typedRow.messages.map((message) => message.senderId)).size,
    memberCount,
    typedRow.aiSummary ?? undefined,
    typedRow.subscriptions?.length ?? 0
  );
}
