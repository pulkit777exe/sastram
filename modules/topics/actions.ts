'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { requireSession } from '@/modules/auth/session';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/lib/utils/slug';
import { createTag, addTagToThread } from '@/modules/tags/repository';
import { createServerAction } from '@/lib/utils/server-action';

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
});

export const createTopic = createServerAction(
  { schema: createTopicSchema, actionName: 'createTopic' },
  async ({ title, description, tags }) => {
    const session = await requireSession();

    const section = await prisma.thread.create({
      data: {
        name: title,
        description: description,
        createdBy: session.user.id,
        slug: buildThreadSlug(title),
      },
    });

    const uniqueTags = Array.from(
      new Set((tags ?? []).map((tag) => tag.toLowerCase()))
    ).slice(0, 5);

    if (uniqueTags.length > 0) {
      for (const tagName of uniqueTags) {
        const tag = await createTag(tagName);
        await addTagToThread(section.id, tag.id);
      }
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/threads');
    return { data: null, error: null };
  }
);
