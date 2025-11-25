"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import type { ActionResponse, Conversation, ChatMessage, AttachmentInput } from "@/lib/types";
import { buildThreadSlug } from "@/modules/threads/service";
import { emitThreadMessage } from "@/modules/ws/publisher";

export async function getConversations(): Promise<ActionResponse<Conversation[]>> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { success: false, error: "Unauthorized" };
        }

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

        const conversations = sections.map((section) => ({
            id: section.id,
            name: section.name,
            avatar: "", // TODO: Add section icon support
            lastMessage: section.messages[0]?.content || "No messages yet",
            timestamp:
                section.messages[0]?.createdAt.toISOString() ||
                section.updatedAt.toISOString(),
            unread: 0, // TODO: Implement unread count
            online: true,
            type: "channel" as const,
        }));

        return { success: true, data: conversations };
    } catch (error) {
        logger.error("[GET_CONVERSATIONS]", error);
        return { success: false, error: "Failed to fetch conversations" };
    }
}

export async function createConversation(data: {
    name: string;
    description?: string;
    type: "channel" | "dm";
    memberIds?: string[];
}): Promise<ActionResponse<Conversation>> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { success: false, error: "Unauthorized" };
        }

        const { name, description, type } = data;

        if (!name) {
            return { success: false, error: "Name is required" };
        }

        if (type === "channel") {
            const section = await prisma.section.create({
                data: {
                    name,
                    description,
                    createdBy: session.user.id,
                    slug: buildThreadSlug(name),
                },
            });

            revalidatePath("/chat");
            return {
                success: true,
                data: {
                    id: section.id,
                    name: section.name,
                    avatar: "",
                    lastMessage: "No messages yet",
                    timestamp: section.updatedAt.toISOString(),
                    unread: 0,
                    online: true,
                    type: "channel",
                },
            };
        }

        return { success: false, error: "Invalid type" };
    } catch (error) {
        logger.error("[CREATE_CONVERSATION]", error);
        return { success: false, error: "Failed to create conversation" };
    }
}

export async function getMessages(conversationId: string): Promise<ActionResponse<ChatMessage[]>> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { success: false, error: "Unauthorized" };
        }

        if (!conversationId) {
            return { success: false, error: "Conversation ID missing" };
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
            status: "read" as const,
        }));

        return { success: true, data: formattedMessages };
    } catch (error) {
        logger.error("[GET_MESSAGES]", error);
        return { success: false, error: "Failed to fetch messages" };
    }
}

export async function sendMessage(data: {
    content: string;
    conversationId: string;
    attachments?: AttachmentInput[];
}): Promise<ActionResponse<ChatMessage>> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { success: false, error: "Unauthorized" };
        }

        const { content, conversationId, attachments } = data;

        if (!content && (!attachments || attachments.length === 0)) {
            return { success: false, error: "Missing content or attachments" };
        }

        const message = await prisma.message.create({
            data: {
                content: content || "",
                sectionId: conversationId,
                senderId: session.user.id,
                attachments: {
                    create:
                        attachments?.map((att) => ({
                            url: att.url,
                            type: att.type as "FILE" | "IMAGE" | "GIF",
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

        emitThreadMessage(conversationId, {
            type: "NEW_MESSAGE",
            payload: {
                id: message.id,
                content: message.content,
                senderId: message.senderId,
                senderName: message.sender.name || session.user.email,
                senderAvatar: message.sender.image,
                createdAt: message.createdAt,
                sectionId: conversationId,
            },
        });

        revalidatePath("/chat"); // Revalidate to show new message
        return {
            success: true,
            data: {
                id: message.id,
                sender: message.sender.name || message.sender.email,
                content: message.content,
                timestamp: message.createdAt.toISOString(),
                avatar: message.sender.image,
                isOwn: true,
                status: "sent" as const,
                attachments: message.attachments,
            },
        };
    } catch (error) {
        logger.error("[SEND_MESSAGE]", error);
        return { success: false, error: "Failed to send message" };
    }
}
