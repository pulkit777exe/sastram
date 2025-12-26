import { prisma } from "@/lib/infrastructure/prisma";

export async function searchThreads(query: string, limit: number = 20, offset: number = 0) {
  const searchTerm = `%${query}%`;

  const [threads, total] = await Promise.all([
    prisma.section.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { summary: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            messages: true,
            members: true,
          },
        },
      },
      orderBy: [
        { messageCount: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.section.count({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { summary: { contains: query, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return {
    threads,
    total,
    hasMore: offset + limit < total,
  };
}

export async function searchMessages(
  query: string,
  threadId?: string,
  limit: number = 20,
  offset: number = 0
) {
  const where: any = {
    deletedAt: null,
    content: { contains: query, mode: "insensitive" },
  };

  if (threadId) {
    where.sectionId = threadId;
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            avatarUrl: true,
          },
        },
        section: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.message.count({ where }),
  ]);

  return {
    messages,
    total,
    hasMore: offset + limit < total,
  };
}

export async function searchUsers(query: string, limit: number = 20, offset: number = 0) {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        avatarUrl: true,
        bio: true,
        followerCount: true,
        followingCount: true,
        reputationPoints: true,
      },
      orderBy: [
        { reputationPoints: "desc" },
        { followerCount: "desc" },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return {
    users,
    total,
    hasMore: offset + limit < total,
  };
}

