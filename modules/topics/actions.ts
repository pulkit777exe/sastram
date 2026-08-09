'use server';

import { z } from 'zod';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import { createTag } from '@/modules/tags/repository';
import { createServerAction } from '@/lib/utils/server-action';
import { actionSuccess } from '@/lib/actions/result';

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
});

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

    const uniqueTags = Array.from(new Set((tags ?? []).map((tag) => tag.toLowerCase()))).slice(0, 5);

    if (uniqueTags.length > 0) {
      const createdTags = await Promise.all(uniqueTags.map((tagName) => createTag(tagName)));
      await prisma.threadTagRelation.createMany({
        data: createdTags.map((tag) => ({ threadId: thread.id, tagId: tag.id })),
        skipDuplicates: true,
      });
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/threads');
    return actionSuccess(null);
  }
);
