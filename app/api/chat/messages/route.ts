import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return new NextResponse("Conversation ID missing", { status: 400 });
        }

        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const messages = await prisma.message.findMany({
            where: {
                sectionId: conversationId,
            },
            include: {
                sender: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        const formattedMessages = messages.map((msg) => ({
            id: msg.id,
            sender: msg.sender.name || msg.sender.email,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            avatar: msg.sender.image,
            isOwn: msg.senderId === session.user.id,
            status: "read", // Default status for now
        }));

        return NextResponse.json(formattedMessages);
    } catch (error) {
        console.error("[MESSAGES_GET]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { content, conversationId, attachments } = body;

        if (!content && (!attachments || attachments.length === 0)) {
            return new NextResponse("Missing content or attachments", { status: 400 });
        }

        const message = await prisma.message.create({
            data: {
                content: content || "",
                sectionId: conversationId,
                senderId: session.user.id,
                attachments: {
                    create: attachments?.map((att: any) => ({
                        url: att.url,
                        type: att.type, // Ensure frontend sends 'IMAGE', 'GIF', or 'FILE'
                        name: att.name,
                        size: att.size,
                    })) || [],
                },
            },
            include: {
                sender: true,
                attachments: true,
            },
        });

        return NextResponse.json({
            id: message.id,
            sender: message.sender.name || message.sender.email,
            content: message.content,
            timestamp: message.createdAt.toISOString(),
            avatar: message.sender.image,
            isOwn: true,
            status: "sent",
            attachments: message.attachments,
        });
    } catch (error) {
        console.error("[MESSAGES_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
