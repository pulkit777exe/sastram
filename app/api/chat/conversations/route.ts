import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Fetch sections (channels)
        const sections = await prisma.section.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            include: {
                messages: {
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 1,
                },
            },
        });

        // Transform to Conversation type
        const conversations = sections.map((section) => ({
            id: section.id,
            name: section.name,
            avatar: "", // TODO: Add section icon support
            lastMessage: section.messages[0]?.content || "No messages yet",
            timestamp: section.messages[0]?.createdAt.toISOString() || section.updatedAt.toISOString(),
            unread: 0, // TODO: Implement unread count
            online: true,
            type: "channel",
        }));

        return NextResponse.json(conversations);
    } catch (error) {
        console.error("[CONVERSATIONS_GET]", error);
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
        const { name, description, type } = body;

        if (!name) {
            return new NextResponse("Name is required", { status: 400 });
        }

        if (type === "channel") {
            const section = await prisma.section.create({
                data: {
                    name,
                    description,
                    createdBy: session.user.id,
                },
            });

            return NextResponse.json({
                id: section.id,
                name: section.name,
                avatar: "",
                lastMessage: "No messages yet",
                timestamp: section.updatedAt.toISOString(),
                unread: 0,
                online: true,
                type: "channel",
            });
        }

        return new NextResponse("Invalid type", { status: 400 });
    } catch (error) {
        console.error("[CONVERSATIONS_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}