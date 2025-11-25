import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { CommunitySummary } from "./types";

// Prisma return type for query with _count
// Using @ts-expect-error where Prisma's TypeScript has limitations
type CommunityWithCount = Prisma.CommunityGetPayload<{
  include: {
    _count: { select: {threads: true } };
  };
}>;

export function buildCommunityDTO(
  community: { id: string; slug: string; title: string; description: string | null },
  threadCount: number,
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
  const communities = await prisma.community.findMany({
    include: {
      _count: {
        select: {
          threads: true,
        },
      },
    },
    orderBy: {
      title: "asc",
    },
  });

  return communities.map((community: CommunityWithCount) => 
    buildCommunityDTO(community, community._count.threads)
  );
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
