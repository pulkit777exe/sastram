import { prisma } from "@/lib/infrastructure/prisma";

export async function createTag(name: string, color: string = "#3b82f6") {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return prisma.threadTag.upsert({
    where: { slug },
    update: { name, color },
    create: {
      name,
      slug,
      color,
    },
  });
}

export async function addTagToThread(threadId: string, tagId: string) {
  return prisma.threadTagRelation.upsert({
    where: {
      threadId_tagId: {
        threadId,
        tagId,
      },
    },
    update: {},
    create: {
      threadId,
      tagId,
    },
  });
}

export async function removeTagFromThread(threadId: string, tagId: string) {
  const relation = await prisma.threadTagRelation.findUnique({
    where: {
      threadId_tagId: {
        threadId,
        tagId,
      },
    },
  });

  if (!relation) {
    return null;
  }

  return prisma.threadTagRelation.delete({
    where: {
      id: relation.id,
    },
  });
}

export async function getThreadTags(threadId: string) {
  const relations = await prisma.threadTagRelation.findMany({
    where: { threadId },
    include: {
      tag: true,
    },
  });

  return relations.map((r) => r.tag);
}

export async function getPopularTags(limit: number = 20) {
  const tags = await prisma.threadTag.findMany({
    include: {
      _count: {
        select: {
          threads: true,
        },
      },
    },
    orderBy: {
      threads: {
        _count: "desc",
      },
    },
    take: limit,
  });

  return tags.map((tag) => ({
    ...tag,
    threadCount: tag._count.threads,
  }));
}

