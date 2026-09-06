import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { createCollection, getUserCollections } from '@/modules/collections/repository';
import { prisma } from '@/lib/infrastructure/prisma';
import { parseUserPreferences } from '@/lib/schemas/user-preferences';
import { z } from 'zod';

const createSchema = z.object({ title: z.string().min(1).max(100) });

export const GET = withErrorHandling(async () => {
  const session = await requireSessionOrThrow();
  const collections = await getUserCollections(session.user.id);
  return NextResponse.json(ok(collections));
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await requireSessionOrThrow();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { preferences: true } });
  if ((parseUserPreferences(user?.preferences) as unknown as { collectionsEnabled?: boolean }).collectionsEnabled === false) {
    return NextResponse.json(fail('FORBIDDEN', 'Collections disabled in settings'), { status: HTTP_STATUS.FORBIDDEN });
  }
  const body = createSchema.parse(await request.json());
  const collection = await createCollection(session.user.id, body.title);
  return NextResponse.json(ok(collection), { status: 201 });
});
