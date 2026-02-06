import { prisma } from "@/lib/infrastructure/prisma";
import { ProfilePrivacy } from "@prisma/client";

export async function getPublicProfile(userId: string, viewerId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      location: true,
      website: true,
      twitter: true,
      github: true,
      linkedin: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
      profilePrivacy: true,
      reputationPoints: true,
      followerCount: true,
      followingCount: true,
      role: true,
      status: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });

  if (!user) {
    return null;
  }

  if (user.profilePrivacy === ProfilePrivacy.PRIVATE) {
    if (viewerId !== userId) {
      return null;
    }
  } else if (user.profilePrivacy === ProfilePrivacy.FOLLOWERS_ONLY) {
    if (viewerId !== userId) {
      const isFollowing = await prisma.userFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId || "",
            followingId: userId,
          },
        },
      });

      if (!isFollowing) {
        return null;
      }
    }
  }

  if (viewerId !== userId) {
    return {
      ...user,
      email: undefined,
    };
  }

  return user;
}

export async function getUserThreads(
  userId: string,
  limit: number = 20,
  offset: number = 0,
) {
  const [threads, total] = await Promise.all([
    prisma.section.findMany({
      where: {
        createdBy: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        messageCount: true,
        memberCount: true,
        createdAt: true,
        updatedAt: true,
        community: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.section.count({
      where: {
        createdBy: userId,
        deletedAt: null,
      },
    }),
  ]);

  return {
    threads,
    total,
    hasMore: offset + limit < total,
  };
}

export async function updateProfilePrivacy(
  userId: string,
  privacy: ProfilePrivacy,
) {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePrivacy: privacy },
  });
}

export async function getUserMessages(
  userId: string,
  limit: number = 20,
  offset: number = 0,
) {
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: {
        senderId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        parentId: true,
        section: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        parent: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.message.count({
      where: {
        senderId: userId,
        deletedAt: null,
      },
    }),
  ]);

  return {
    messages,
    total,
    hasMore: offset + limit < total,
  };
}
