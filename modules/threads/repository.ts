import { prisma } from "@/lib/infrastructure/prisma";
import { Prisma } from "@prisma/client";
import type { ThreadDetail, ThreadRecord, ThreadSummary } from "./types";
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

export async function listThreads(): Promise<ThreadSummary[]> {
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
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        select: {
          senderId: true,
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
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  });

  return threads.map((thread: SectionWithCommunityAndCount) => {
    // Count unique active users from last 7 days
    const uniqueActiveUsers = new Set(thread.messages.map((m) => m.senderId));
    return buildThreadDTO(
      thread as unknown as ThreadRecord,
      thread._count.messages,
      uniqueActiveUsers.size
    );
  });
}

export async function getThreadBySlug(
  slug: string
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
    typedRecord.newsletterSubscriptions?.length ?? 0
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
    0
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  await prisma.section.delete({
    where: { id: threadId },
  });
}
