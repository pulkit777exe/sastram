'use server';

import { logger } from '@/lib/infrastructure/logger';

import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { buildThreadSlug } from '@/modules/threads/service';
import { createTopicSchema } from './schemas';
import { createTag, addTagToThread } from '@/modules/tags/repository';

export async function createTopic(formData: FormData) {
  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const icon = (formData.get('icon') as string) || 'Hash';
  const rawTags = formData.get('tags');

  let tags: string[] = [];
  if (typeof rawTags === 'string' && rawTags.length > 0) {
    try {
      const parsedTags = JSON.parse(rawTags);
      if (Array.isArray(parsedTags)) {
        tags = parsedTags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
      }
    } catch {
      tags = [];
    }
  }

  const parsed = createTopicSchema.safeParse({ title, description, tags, icon });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: 'Something went wrong' };
    }

    const section = await prisma.section.create({
      data: {
        name: parsed.data.title,
        description: parsed.data.description,
        createdBy: session.user.id,
        slug: buildThreadSlug(parsed.data.title),
      },
    });

    const uniqueTags = Array.from(
      new Set((parsed.data.tags ?? []).map((tag) => tag.toLowerCase()))
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
  } catch (error) {
    logger.error('[createTopic]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
