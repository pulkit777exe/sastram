import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { buildThreadSlug } from "@/modules/threads/service";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sections = await prisma.section.findMany({
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
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
      orderBy: { updatedAt: "desc" },
    });

    const conversations = sections.map((section) => {
      const lastMessage = section.messages[0];
      return {
        id: section.id,
        name: section.name,
        avatar: section.icon || "",
        lastMessage: lastMessage
          ? `${lastMessage.sender.name}: ${lastMessage.content.substring(0, 50)}...`
          : "No messages yet",
        timestamp: lastMessage
          ? new Date(lastMessage.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
        unread: 0, // Implement unread count logic if needed
        online: false,
        type: "channel" as const,
      };
    });

    return NextResponse.json(conversations);
  } catch (error) {
    logger.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can create sections" },
        { status: 403 }
      );
    }

    const { name } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "Section name is required" },
        { status: 400 }
      );
    }

    const section = await prisma.section.create({
      data: {
        name,
        createdBy: session.user.id,
        slug: buildThreadSlug(name),
      },
    });

    return NextResponse.json({
      id: section.id,
      name: section.name,
      avatar: section.icon || "",
      lastMessage: "No messages yet",
      timestamp: "",
      unread: 0,
      online: false,
      type: "channel" as const,
    });
  } catch (error) {
    logger.error("Error creating section:", error);
    return NextResponse.json(
      { error: "Failed to create section" },
      { status: 500 }
    );
  }
}