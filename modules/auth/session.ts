import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Role, SectionMember, SectionRole, User } from '@prisma/client';
import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'image' | 'role' | 'status'>;

export interface SessionPayload {
  user: SessionUser;
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const { user } = session;
  // Fetch the full user from database to get the role field
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      status: true,
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: (fullUser?.role as Role) ?? Role.USER,
      status: fullUser?.status ?? 'ACTIVE',
    },
  };
});

export async function requireSession(checkBanStatus = true): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect('/login?reason=session_expired');
  }

  if (checkBanStatus && session.user.status === 'BANNED') {
    redirect('/banned');
  }

  return session;
}

/**
 * Require that a user is a member of the given section.
 * Returns the SectionMember record if membership exists.
 * Throws (redirects to dashboard) if not a member.
 *
 * Usage in server actions:
 *   const membership = await requireSectionMembership(sectionId, session.user.id);
 *
 * Usage in API routes (throws instead of redirecting):
 *   const membership = await requireSectionMembershipOrThrow(sectionId, userId);
 */
export async function requireSectionMembership(
  sectionId: string,
  userId: string,
  requiredRole?: SectionRole
): Promise<SectionMember> {
  const membership = await prisma.sectionMember.findUnique({
    where: { sectionId_userId: { sectionId, userId } },
  });

  if (!membership) {
    redirect('/dashboard');
  }

  if (requiredRole && membership.role !== requiredRole) {
    redirect('/dashboard');
  }

  return membership;
}

/**
 * API route variant — throws an error instead of redirecting.
 * Use in API route handlers where redirect() is not available.
 */
export async function requireSectionMembershipOrThrow(
  sectionId: string,
  userId: string,
  requiredRole?: SectionRole
): Promise<SectionMember> {
  const membership = await prisma.sectionMember.findUnique({
    where: { sectionId_userId: { sectionId, userId } },
  });

  if (!membership) {
    throw new Error('Forbidden: not a member of this section');
  }

  if (requiredRole && membership.role !== requiredRole) {
    throw new Error('Forbidden: insufficient role');
  }

  return membership;
}

export function isAdmin(user: SessionUser | undefined | null): boolean {
  return user?.role === Role.ADMIN;
}

export function assertAdmin(user: SessionUser | undefined | null) {
  if (!isAdmin(user)) {
    redirect('/dashboard');
  }
}
