import { prisma } from '@/lib/infrastructure/prisma';
import { rateLimit } from '@/lib/services/rate-limit';
import { requireModerationRole } from '@/modules/policy';

export async function requireModerationSession() {
  return requireModerationRole();
}

export async function applyModerationRateLimit(userId: string) {
  try {
    const result = await rateLimit({ key: userId, type: 'api' });
    if (!result.success) {
      throw new Error('Rate limit exceeded. Please slow down.');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Rate limit exceeded. Please slow down.');
  }
}

export async function validateModerationTarget(
  targetUserId: string,
  moderatorId: string,
  moderatorRole: string
) {
  if (targetUserId === moderatorId) {
    throw new Error('Cannot perform moderation actions on yourself');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      role: true,
      status: true,
      name: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  if (targetUser.role === 'ADMIN' && moderatorRole !== 'SUPER_ADMIN') {
    throw new Error('Cannot moderate administrator accounts');
  }

  return targetUser;
}

export async function validateEntityForDeletion(
  entityType: 'message' | 'section' | 'community',
  entityId: string
) {
  let entity: unknown;

  switch (entityType) {
    case 'message':
      entity = await prisma.message.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          sectionId: true,
          senderId: true,
          section: {
            select: { name: true, slug: true },
          },
        },
      });
      break;
    case 'section':
      entity = await prisma.section.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          name: true,
          slug: true,
          messageCount: true,
          memberCount: true,
        },
      });
      break;
    case 'community':
      entity = await prisma.community.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          title: true,
          slug: true,
        },
      });
      break;
  }

  if (!entity) {
    throw new Error(`${entityType} not found`);
  }

  return entity;
}
