import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/infrastructure/prisma';
import { auth } from '@/lib/services/auth';
import { logger } from '@/lib/infrastructure/logger';
import { buildThreadSlug } from '@/lib/utils/slug';
import { ok, fail } from '@/lib/utils/api-response';

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }

    const threads = await prisma.thread.findMany({
      where: {
        members: { some: { userId: session.user.id } },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
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
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to fetch conversations'), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let name: string;
    try {
      const body = await req.json();
      name = body.name;
      if (!name) {
        return NextResponse.json(fail('VALIDATION_ERROR', 'Thread name is required'), { status: 400 });
      }
    } catch {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid request body'), { status: 400 });
    }

    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }

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
  } catch (error) {
    logger.error('Error creating thread:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to create thread'), { status: 500 });
  }
}
