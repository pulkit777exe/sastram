import { prisma } from "@/lib/infrastructure/prisma";
import { Prisma } from "@prisma/client";
import type {
  ThreadDetail,
  ThreadRecord,
  ThreadSummary,
  ThreadMember,
} from "./types";
import { SectionRole } from "@prisma/client";
import { buildThreadDTO, buildThreadDetailDTO } from "./service";

type SectionWithCommunityAndCount = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: { select: { senderId: true } };
    _count: { select: { messages: true } };
  };
}>;

type SectionWithFullDetails = Prisma.SectionGetPayload<{
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
    newsletterSubscriptions: true;
    digests: true;
    _count: { select: { messages: true } };
  };
}>;

type SectionWithCommunityAndMessages = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: true;
    _count: { select: { messages: true } };
  };
}>;

export interface ListThreadsParams {
  page?: number;
  pageSize?: number;
  sortBy?: "recent" | "popular" | "trending" | "oldest";
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

export async function listThreads(
  params: ListThreadsParams = {},
): Promise<PaginatedThreads> {
  const { page = 1, pageSize = 10, sortBy = "recent" } = params;
  const skip = (page - 1) * pageSize;

  const totalItems = await prisma.section.count({
    where: { deletedAt: null },
  });

  const threads = await prisma.section.findMany({
    where: {
      deletedAt: null,
    },
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
    orderBy:
      sortBy === "oldest"
        ? { createdAt: "asc" }
        : sortBy === "popular"
          ? { messageCount: "desc" }
          : { updatedAt: "desc" },
    skip,
    take: pageSize,
  });

  let mappedThreads = threads.map((thread: SectionWithCommunityAndCount) => {
    const uniqueActiveUsers = new Set(thread.messages.map((m) => m.senderId));
    return buildThreadDTO(
      thread as unknown as ThreadRecord,
      thread._count.messages,
      uniqueActiveUsers.size,
    );
  });

  if (sortBy === "trending") {
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
      hasPreviousPage: page > 1
    },
  };
}

export async function getThreadBySlug(
  slug: string,
): Promise<ThreadDetail | null> {
  const record = await prisma.section.findFirst({
    where: {
      slug,
      deletedAt: null,
    },
    include: {
      community: true,
      messages: {
        where: {
          deletedAt: null,
        },
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
          createdAt: "asc",
        },
      },
      newsletterSubscriptions: true,
      digests: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
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
  });

  if (!record) {
    return null;
  }

  const typedRecord = record as SectionWithFullDetails;
  return buildThreadDetailDTO(
    typedRecord as unknown as ThreadRecord,
    typedRecord._count.messages,
    new Set(typedRecord.messages.map((m) => m.senderId)).size,
    typedRecord.digests[0]?.summary,
    typedRecord.newsletterSubscriptions?.length ?? 0,
  );
}

export async function createThread(payload: {
  name: string;
  description?: string | null;
  icon?: string | null;
  communityId?: string | null;
  slug: string;
  createdBy: string;
}): Promise<ThreadSummary> {
  const thread = await prisma.section.create({
    data: {
      name: payload.name,
      description: payload.description,
      icon: payload.icon,
      communityId: payload.communityId,
      slug: payload.slug,
      createdBy: payload.createdBy,
    },
    include: {
      community: true,
      messages: true,
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  const typedThread = thread as SectionWithCommunityAndMessages;
  return buildThreadDTO(
    typedThread as ThreadRecord,
    typedThread._count.messages,
    0,
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  await prisma.section.delete({
    where: { id: threadId },
  });
}
export async function getThreadMembers(
  threadId: string,
): Promise<ThreadMember[]> {
  const members = await prisma.sectionMember.findMany({
    where: {
      sectionId: threadId,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          status: true,
          lastSeenAt: true,
        },
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    user: {
      id: member.user.id,
      name: member.user.name,
      avatarUrl: member.user.image,
      status: member.user.status,
      lastSeenAt: member.user.lastSeenAt,
    },
  }));
}

export async function addThreadMember(
  threadId: string,
  userId: string,
  role: SectionRole = "MEMBER",
): Promise<void> {
  await prisma.sectionMember.upsert({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
    update: {
      role,
      status: "ACTIVE",
    },
    create: {
      sectionId: threadId,
      userId,
      role,
      status: "ACTIVE",
    },
  });
}

export async function updateThreadMemberRole(
  threadId: string,
  userId: string,
  role: SectionRole,
): Promise<void> {
  await prisma.sectionMember.update({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
    data: {
      role,
    },
  });
}

export async function removeThreadMember(
  threadId: string,
  userId: string,
): Promise<void> {
  await prisma.sectionMember.delete({
    where: {
      sectionId_userId: {
        sectionId: threadId,
        userId,
      },
    },
  });
}
