import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { StreamChat } from "stream-chat";

export async function POST(req: NextRequest) {
    try {
        // Validate environment variables
        const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
        const apiSecret = process.env.STREAM_CHAT_SECRET;

        if (!apiKey || !apiSecret) {
            console.error("[/api/register-user] Missing Stream API credentials");
            return NextResponse.json({ error: "Configuration error" }, { status: 500 });
        }

        // Parse request body
        let body;
        try {
            body = await req.json();
            console.log("[/api/register-user] Body:", body);
        } catch (error) {
            console.error("[/api/register-user] Invalid JSON:", error);
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }

        // Validate request parameters
        const userId = body?.userId;
        const email = body?.email;

        if (!userId || !email) {
            console.error("[/api/register-user] Missing userId or email in request body");
            return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
        }

        // Initialize Stream client
        const serverClient = StreamChat.getInstance(apiKey, apiSecret);

        // Register user with Stream
        try {
            await serverClient.upsertUser({
                id: userId,
                role: "user",
                name: email,
                image: `https://getstream.io/random_png/?id=${userId}&name=${email}`,
            });
        } catch (error) {
            console.error("[/api/register-user] Error upserting Stream user:", error);
            return NextResponse.json({ error: "Failed to register with Stream" }, { status: 500 });
        }

        // Update Clerk user metadata
        try {
            const clerk = await clerkClient();
            const updatedUser = await clerk.users.updateUser(userId, {
                publicMetadata: {
                    streamRegistered: true,
                },
            });
            console.log("[/api/register-user] Updated Clerk user:", updatedUser.id);
        } catch (error) {
            console.error("[/api/register-user] Error updating Clerk user:", error);
            // Continue despite Clerk error since Stream registration succeeded
        }

        // Return success response
        return NextResponse.json({
            userId,
            userName: email,
        });
    } catch (error) {
        console.error("[/api/register-user] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
