'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, assertAdmin } from '@/modules/auth/session';
import { buildThreadSlug } from './service';
import {
  createThread,
  deleteThread,
  listThreads,
  getThreadMembers,
  updateThreadMemberRole,
  removeThreadMember,
  updateThreadDNA,
  updateResolutionScore,
  updateThreadStaleness,
} from './repository';
import { prisma } from '@/lib/infrastructure/prisma';
import { SectionRole } from '@prisma/client';

const threadSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(480).optional().or(z.literal('')),
  communityId: z.string().cuid().optional().or(z.literal('')),
  initialMessage: z.string().optional(),
});

const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

const threadListSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  sortBy: z.enum(['recent', 'popular', 'trending', 'oldest']).optional(),
});

const manageMemberSchema = z.object({
  threadId: z.string().cuid(),
  userId: z.string().cuid(),
  action: z.enum(['update_role', 'remove']),
  role: z.nativeEnum(SectionRole).optional(),
});

export async function createThreadAction(formData: FormData) {
  const parsed = threadSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    communityId: formData.get('communityId'),
    initialMessage: formData.get('initialMessage'),
  });

  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    assertAdmin(session.user);

    const slug = buildThreadSlug(parsed.data.title);
    await createThread({
      name: parsed.data.title,
      description: parsed.data.description,
      communityId: parsed.data.communityId || null,
      slug,
      createdBy: session.user.id,
      initialMessage: parsed.data.initialMessage,
    });

    revalidatePath('/dashboard');
    return { data: null, error: null };
  } catch (error) {
    console.error('[createThreadAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function deleteThreadAction(threadId: string) {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();
    assertAdmin(session.user);

    await deleteThread(parsed.data.threadId);
    revalidatePath('/dashboard');
    return { data: null, error: null };
  } catch (error) {
    console.error('[deleteThreadAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getDashboardThreads(params?: {
  page?: number;
  pageSize?: number;
  sortBy?: 'recent' | 'popular' | 'trending' | 'oldest';
}) {
  const parsed = threadListSchema.safeParse(params ?? {});
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const result = await listThreads(parsed.data);
    return { data: result, error: null };
  } catch (error) {
    console.error('[getDashboardThreads]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function getThreadMembersAction(threadId: string) {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    await requireSession();
    const members = await getThreadMembers(parsed.data.threadId);
    return { data: members, error: null };
  } catch (error) {
    console.error('[getThreadMembersAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}

export async function manageThreadMemberAction(payload: {
  threadId: string;
  userId: string;
  action: 'update_role' | 'remove';
  role?: SectionRole;
}) {
  const parsed = manageMemberSchema.safeParse(payload);
  if (!parsed.success) {
    return { data: null, error: 'Invalid input' };
  }

  try {
    const session = await requireSession();

    const thread = await prisma.section.findUnique({
      where: { id: parsed.data.threadId },
      select: { createdBy: true, slug: true },
    });

    if (!thread) {
      return { data: null, error: 'Something went wrong' };
    }

    const isCreator = thread.createdBy === session.user.id;

    // Allow Creator or Global Admin
    if (!isCreator) {
      try {
        assertAdmin(session.user);
      } catch {
        return { data: null, error: 'Something went wrong' };
      }
    }

    if (parsed.data.userId === session.user.id) {
      return { data: null, error: 'Something went wrong' };
    }

    if (parsed.data.action === 'update_role') {
      if (!parsed.data.role) {
        return { data: null, error: 'Invalid input' };
      }
      await updateThreadMemberRole(parsed.data.threadId, parsed.data.userId, parsed.data.role);
    } else if (parsed.data.action === 'remove') {
      await removeThreadMember(parsed.data.threadId, parsed.data.userId);
    }

    revalidatePath(`/dashboard/threads/thread/${thread.slug}`);
    return { data: null, error: null };
  } catch (error) {
    console.error('[manageThreadMemberAction]', error);
    return { data: null, error: 'Something went wrong' };
  }
}
