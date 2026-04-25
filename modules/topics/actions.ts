'use server';

import { z } from 'zod';
import { logger } from '@/lib/infrastructure/logger';
import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/modules/threads/service';
import { createTag, addTagToThread } from '@/modules/tags/repository';
import { createServerAction } from '@/lib/utils/server-action';

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(280).optional().or(z.literal('')),
  icon: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createTopic = createServerAction(
  { schema: createTopicSchema, actionName: 'createTopic' },
  async ({ title, description, icon, tags }) => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: 'Something went wrong' };
    }

    const section = await prisma.section.create({
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
