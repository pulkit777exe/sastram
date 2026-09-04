'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/modules/threads/slug';
import { createTag } from '@/modules/tags/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
});

function normalizeTopicTags(tags?: string[]): string[] {
  if (!tags?.length) return [];
  const lowered = tags.map((tag) => tag.toLowerCase());
  return Array.from(new Set(lowered)).slice(0, 5);
}

async function attachTagsToThread(threadId: string, tagNames: string[]) {
  if (tagNames.length === 0) return;
  const createdTags = await Promise.all(tagNames.map((tagName) => createTag(tagName)));
  const relations = createdTags.map((tag) => ({ threadId, tagId: tag.id }));
  await prisma.threadTagRelation.createMany({ data: relations, skipDuplicates: true });
}

export const createTopic = createServerAction(
  { schema: createTopicSchema, actionName: 'createTopic' },
  async ({ title, description, tags }) => {
    const session = await requireSession();

    const thread = await prisma.thread.create({
      data: {
        name: title,
        description,
        createdBy: session.user.id,
        slug: buildThreadSlug(title),
      },
    });

    const uniqueTags = normalizeTopicTags(tags);
    await attachTagsToThread(thread.id, uniqueTags);

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/threads');
    return actionSuccess(null);
  }
);
