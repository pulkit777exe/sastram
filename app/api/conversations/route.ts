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

    const sections = await prisma.section.findMany({
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

    const conversations = sections.map((section) => {
      const lastMessage = section.messages[0];
      return {
        id: section.id,
        name: section.name,
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
        return NextResponse.json(fail('VALIDATION_ERROR', 'Section name is required'), { status: 400 });
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
      return NextResponse.json(fail('FORBIDDEN', 'Only admins can create sections'), { status: 403 });
    }

    const section = await prisma.section.create({
      data: {
        name,
        createdBy: session.user.id,
        slug: buildThreadSlug(name),
      },
    });

    return NextResponse.json(ok({
      id: section.id,
      name: section.name,
      avatar: '',
      lastMessage: 'No messages yet',
      timestamp: '',
      unread: 0,
      online: false,
      type: 'channel' as const,
    }));
  } catch (error) {
    logger.error('Error creating section:', error);
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to create section'), { status: 500 });
  }
}
