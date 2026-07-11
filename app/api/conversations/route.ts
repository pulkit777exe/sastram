import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadSlug } from '@/lib/utils/slug';
import { ok, fail, withErrorHandling } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { rateLimit } from '@/lib/services/rate-limit';
import { z } from 'zod';

const createConversationSchema = z.object({
  name: z.string().min(1).max(100),
});

const getHandler = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionOrThrow();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const threads = await prisma.thread.findMany({
    where: {
      members: { some: { userId: session.user.id } },
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          sender: {
            select: {
              name: true,
              image: true,
            },
          },
        },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    skip: offset,
  });

  const conversations = threads.map((thread) => {
    const lastMessage = thread.messages[0];
    return {
      id: thread.id,
      name: thread.name,
      avatar: '',
      lastMessage: lastMessage
        ? `${lastMessage.sender.name}: ${lastMessage.content.substring(0, 50)}...`
        : 'No messages yet',
      timestamp: lastMessage ? new Date(lastMessage.createdAt).toISOString() : '',
      unread: 0, // Implement unread count logic if needed
      online: false,
      type: 'channel' as const,
    };
  });

  return NextResponse.json(ok(conversations));
});

const postHandler = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionOrThrow();

  // Rate limit thread creation
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimitResult = await rateLimit({ key: `conversations:${session.user.id}:${ip}`, type: 'api' });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail('RATE_LIMITED', 'Too many requests. Please try again later.'), { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input'),
      { status: 400 }
    );
  }
  const { name } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== 'ADMIN') {
    return NextResponse.json(fail('FORBIDDEN', 'Only admins can create threads'), { status: 403 });
  }

  const thread = await prisma.thread.create({
    data: {
      name,
      createdBy: session.user.id,
      slug: buildThreadSlug(name),
    },
  });

  return NextResponse.json(ok({
    id: thread.id,
    name: thread.name,
    avatar: '',
    lastMessage: 'No messages yet',
    timestamp: '',
    unread: 0,
    online: false,
    type: 'channel' as const,
  }));
});

export { getHandler as GET, postHandler as POST };
