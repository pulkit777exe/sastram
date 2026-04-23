import { auth } from '@/lib/services/auth';
import { prisma } from '@/lib/infrastructure/prisma';
import { Role } from '@prisma/client';
import { headers } from 'next/headers';

export async function requireModerator() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || (user.role !== Role.MODERATOR && user.role !== Role.ADMIN)) {
    throw new Error('Moderator access required');
  }

  return session;
}

export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!user || user.role !== Role.ADMIN) {
    throw new Error('Admin access required');
  }

  return session;
}
