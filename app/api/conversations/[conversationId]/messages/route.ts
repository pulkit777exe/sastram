import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET(
    request: NextRequest, 
    { params }: { params: Promise<{ conversationId: string }> }
) {
    const { conversationId } = await params;
    const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        include: {
            sender: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                }
            }
        }
    });
    return NextResponse.json(messages);
}

export async function POST(
    request: NextRequest, 
    { params }: { params: Promise<{ conversationId: string }> }
) {
    const { conversationId } = await params;
    const { content } = await request.json();

    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user?.id) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const newMessage = await prisma.message.create({
        data: {
            content,
            conversationId,
            senderId: session.user.id,
        },
        include: {
            sender: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                }
            }
        }
    });

    return NextResponse.json(newMessage);
}