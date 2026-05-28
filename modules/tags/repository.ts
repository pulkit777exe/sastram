import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { slugify } from '@/lib/utils/slug';

export async function createTag(name: string, color: string = '#3b82f6') {
  const slug = slugify(name);

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
  try {
    await prisma.threadTagRelation.delete({
      where: {
        threadId_tagId: { threadId, tagId },
      },
    });
    return { id: '' };
  } catch {
    return null;
  }
}

export async function getThreadTags(threadId: string) {
  try {
    const relations = await prisma.threadTagRelation.findMany({
      where: { threadId },
      include: {
        tag: true,
      },
    });

    return (relations ?? []).map((relation) => relation.tag);
  } catch (error) {
    logger.error('[getThreadTags]', error);
    return [];
  }
}

export async function getPopularTags(limit: number = 20) {
  try {
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
          _count: 'desc',
        },
      },
      take: limit,
    });

    return (tags ?? []).map((tag) => ({
      ...tag,
      threadCount: tag._count.threads,
    }));
  } catch (error) {
    logger.error('[getPopularTags]', error);
    return [];
  }
}

export async function updateTag(id: string, data: { name?: string; color?: string }) {
  const updateData: { name?: string; slug?: string; color?: string } = { ...data };
  if (data.name) {
    updateData.slug = slugify(data.name);
  }
  return prisma.threadTag.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTag(id: string) {
  await prisma.threadTagRelation.deleteMany({ where: { tagId: id } });
  return prisma.threadTag.delete({ where: { id } });
}

export async function listAllTags(params?: { page?: number; pageSize?: number; search?: string }) {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 50;
  const search = params?.search;

  const where = search
    ? { name: { contains: search, mode: 'insensitive' as const } }
    : {};

  const [tags, total] = await Promise.all([
    prisma.threadTag.findMany({
      where,
      include: { _count: { select: { threads: true } } },
      orderBy: { threads: { _count: 'desc' } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.threadTag.count({ where }),
  ]);

  return {
    tags: tags.map((t) => ({ ...t, threadCount: t._count.threads })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getTagBySlug(slug: string) {
  try {
    const tag = await prisma.threadTag.findUnique({
      where: { slug },
      include: {
        _count: { select: { threads: true } },
      },
    });
    if (!tag) return null;
    return { ...tag, threadCount: tag._count.threads };
  } catch (error) {
    logger.error('[getTagBySlug]', error);
    return null;
  }
}

export async function getThreadsByTag(tagId: string, memberUserIds?: string[]) {
  try {
    const where: Record<string, unknown> = { tags: { some: { tagId } } };
    if (memberUserIds && memberUserIds.length > 0) {
      where.members = { some: { userId: { in: memberUserIds }, status: 'ACTIVE' } };
    }

    const threads = await prisma.section.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        messageCount: true,
        memberCount: true,
        community: { select: { title: true } },
        tags: { select: { tag: { select: { name: true, slug: true, color: true } } } },
        messages: { select: { senderId: true, createdAt: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return threads.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.name,
      description: t.description ?? '',
      activeUsers: new Set(t.messages.map((m) => m.senderId)).size,
      messagesCount: t._count.messages,
      trending: t._count.messages > 10,
      tags: t.tags.map((rel) => rel.tag.name),
    }));
  } catch (error) {
    logger.error('[getThreadsByTag]', error);
    return [];
  }
}

export async function mergeTags(sourceId: string, targetId: string) {
  const relations = await prisma.threadTagRelation.findMany({
    where: { tagId: sourceId },
  });

  await Promise.all(
    relations.map((r) =>
      prisma.threadTagRelation.upsert({
        where: { threadId_tagId: { threadId: r.threadId, tagId: targetId } },
        update: {},
        create: { threadId: r.threadId, tagId: targetId },
      })
    )
  );

  await prisma.threadTagRelation.deleteMany({ where: { tagId: sourceId } });
  await prisma.threadTag.delete({ where: { id: sourceId } });

  return prisma.threadTag.findUnique({ where: { id: targetId } });
}
