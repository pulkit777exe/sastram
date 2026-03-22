import { prisma } from "@/lib/infrastructure/prisma";
import { Prisma } from "@prisma/client";
import type { CommunitySummary } from "./types";
import { dedupe } from "@/lib/dedupe";
import { logger } from "@/lib/infrastructure/logger";

// Prisma return type for query with _count
// Using @ts-expect-error where Prisma's TypeScript has limitations
type CommunityWithCount = Prisma.CommunityGetPayload<{
  include: {
    _count: { select: { sections: true } };
  };
}>;

export function buildCommunityDTO(
  community: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
  },
  threadCount: number
): CommunitySummary {
  return {
    id: community.id,
    slug: community.slug,
    title: community.title,
    description: community.description,
    threadCount,
  };
}

export async function listCommunities(): Promise<CommunitySummary[]> {
  try {
    const communities = await dedupe("communities:list", () =>
      prisma.community.findMany({
        include: {
          _count: {
            select: {
              sections: true,
            },
          },
        },
        orderBy: {
          title: "asc",
        },
      }),
    );

    return (communities ?? []).map((community: CommunityWithCount) =>
      buildCommunityDTO(community, community._count.sections)
    );
  } catch (error) {
    logger.error("[listCommunities]", error);
    return [];
  }
}

export async function getJoinedCommunities(userId: string) {
  try {
    const communities = await dedupe(`communities:joined:${userId}`, () =>
      prisma.community.findMany({
        where: {
          sections: {
            some: {
              members: {
                some: {
                  userId,
                  status: "ACTIVE",
                },
              },
            },
          },
        },
        orderBy: { title: "asc" },
      }),
    );

    return communities ?? [];
  } catch (error) {
    logger.error("[getJoinedCommunities]", error);
    return [];
  }
}

export async function createCommunity(payload: {
  title: string;
  description?: string | null;
  slug: string;
  createdBy: string;
}): Promise<CommunitySummary> {
  const community = await prisma.community.create({
    data: payload,
  });

  return buildCommunityDTO(community, 0);
}
