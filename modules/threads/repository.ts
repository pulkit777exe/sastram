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
import { dedupe } from "@/lib/dedupe";
import { aiService } from "@/lib/services/ai";
import { logger } from "@/lib/infrastructure/logger";

type SectionWithCommunityAndCount = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: { select: { senderId: true } };
    _count: { select: { messages: true; members: true } };
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
    subscriptions: true;
    _count: { select: { messages: true } };
  };
}>;

type SectionWithCommunityAndMessages = Prisma.SectionGetPayload<{
  include: {
    community: true;
    messages: true;
    _count: { select: { messages: true; members: true } };
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
  try {
    const [totalItems, threads] = await dedupe(
      `threads:list:${page}:${pageSize}:${sortBy}`,
      () =>
        Promise.all([
          prisma.section.count(),
          prisma.section.findMany({
            where: {},
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
                  status: "ACTIVE",
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
                      status: "ACTIVE",
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
          }),
        ]),
    );

    let mappedThreads = (threads ?? []).map((thread: SectionWithCommunityAndCount) => {
      const uniqueActiveUsers = new Set(thread.messages.map((m) => m.senderId));
      return buildThreadDTO(
        thread as unknown as ThreadRecord,
        thread._count.messages,
        uniqueActiveUsers.size,
        thread._count.members,
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
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    logger.error("[listThreads]", error);
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

export async function getThreadBySlug(
  slug: string,
): Promise<ThreadDetail | null> {
  const record = await dedupe(`threads:bySlug:${slug}`, () =>
    prisma.section.findFirst({
      where: {
        slug,
      },
      include: {
        community: true,
        messages: {
          // Fetch ALL messages including soft-deleted — deleted messages
          // must stay in tree to preserve child reply structure
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
    }),
  );

  if (!record) {
    return null;
  }

  const typedRecord = record as SectionWithFullDetails;
  // Count active members for the thread
  const memberCount = await prisma.sectionMember.count({
    where: {
      sectionId: typedRecord.id,
      status: "ACTIVE",
    },
  });

  return buildThreadDetailDTO(
    typedRecord as unknown as ThreadRecord,
    typedRecord._count.messages,
    new Set(typedRecord.messages.map((m) => m.senderId)).size,
    memberCount,
    typedRecord.aiSummary ?? undefined,
    typedRecord.subscriptions?.length ?? 0,
  );
}

export async function createThread(payload: {
  name: string;
  description?: string | null;
  communityId?: string | null;
  slug: string;
  createdBy: string;
  initialMessage?: string;
}): Promise<ThreadSummary> {
  const thread = await prisma.section.create({
    data: {
      name: payload.name,
      description: payload.description,
      communityId: payload.communityId,
      slug: payload.slug,
      createdBy: payload.createdBy,
      members: {
        create: {
          userId: payload.createdBy,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
      messages: payload.initialMessage ? {
        create: {
          content: payload.initialMessage,
          senderId: payload.createdBy,
          depth: 0,
          isAiResponse: false,
          isEdited: false,
          isPinned: false,
          likeCount: 0,
          replyCount: 0,
        },
      } : undefined,
    },
    include: {
      community: true,
      messages: true,
      _count: {
        select: {
          messages: true,
          members: true,
        },
      },
    },
  });

  // If there's an initial message, generate thread DNA and resolution score
  if (payload.initialMessage) {
    const initialMessages = [{
      id: thread.messages[0].id,
      content: payload.initialMessage,
      senderId: payload.createdBy,
      sender: {
        id: payload.createdBy,
        name: null,
        image: null,
      },
      createdAt: thread.messages[0].createdAt,
    }];
    
    try {
      const [threadDNA, resolutionScore] = await Promise.all([
        aiService.generateThreadDNA(initialMessages),
        aiService.calculateResolutionScore(initialMessages),
      ]);

      await prisma.section.update({
        where: { id: thread.id },
        data: { threadDna: threadDNA, resolutionScore },
      });
    } catch (error) {
      console.error("Failed to generate thread metadata:", error);
      // Set explicit default values if AI calls fail
      await prisma.section.update({
        where: { id: thread.id },
        data: {
          threadDna: {
            questionType: "other",
            expertiseLevel: "intermediate",
            topics: ["general discussion"],
            readTimeMinutes: 1,
          },
          resolutionScore: 50,
        },
      });
    }
  }

  const typedThread = thread as SectionWithCommunityAndMessages;
  return buildThreadDTO(
    typedThread as ThreadRecord,
    typedThread._count.messages,
    0,
    typedThread._count.members,
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
  try {
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

    return (members ?? []).map((member) => ({
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
  } catch (error) {
    logger.error("[getThreadMembers]", error);
    return [];
  }
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

import { z } from "zod";

const threadDNASchema = z.object({
  questionType: z.enum(["factual", "opinion", "technical", "comparison", "other"]),
  expertiseLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  topics: z.array(z.string()).min(3).max(5),
  readTimeMinutes: z.number().int().min(1),
});

export async function updateThreadDNA(
  threadId: string,
  threadDNA: Record<string, any>,
): Promise<void> {
  const validatedDNA = threadDNASchema.parse(threadDNA);
  await prisma.section.update({
    where: { id: threadId },
    data: { threadDna: validatedDNA },
  });
}

export async function updateResolutionScore(
  threadId: string,
  score: number,
): Promise<void> {
  const validatedScore = z.number().int().min(0).max(100).parse(score);
  await prisma.section.update({
    where: { id: threadId },
    data: { resolutionScore: validatedScore },
  });
}

export async function updateThreadStaleness(
  threadId: string,
  isOutdated: boolean,
): Promise<void> {
  await prisma.section.update({
    where: { id: threadId },
    data: { isOutdated, lastVerifiedAt: new Date() },
  });
}
