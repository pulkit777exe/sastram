import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user?.id) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const conversations = await prisma.conversation.findMany({
        where: {
            members: {
                some: {
                    userId: session.user.id
                }
            }
        },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            image: true,
                        }
                    }
                }
            },
            messages: {
                take: 1,
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            }
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });

    return NextResponse.json(conversations);
}

export async function POST(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user?.id) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { name, type, memberIds } = await request.json();

    if (!name || !type || !Array.isArray(memberIds)) {
        return NextResponse.json(
            { error: "Invalid input" },
            { status: 400 }
        );
    }

    const allMemberIds = Array.from(new Set([...memberIds, session.user.id]));

    const newConversation = await prisma.conversation.create({
        data: {
            name,
            type,
            members: {
                create: allMemberIds.map((userId) => ({
                    userId,
                })),
            },
        },
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            image: true,
                        }
                    }
                }
            }
        }
    });

    return NextResponse.json(newConversation);
}