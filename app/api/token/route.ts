import { StreamChat } from 'stream-chat';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const apiKey = "r3gvsydgmnus";
    const apiSecret = process.env.STREAM_API_KEY_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("[/api/token] Missing Stream API credentials");
      return NextResponse.json({ error: "Configuration error" }, { status: 500 });
    }

    const serverClient = await StreamChat.getInstance("r3gvsydgmnus", apiSecret);
    const body = await request.json();
    console.log('[/api/token] Body:', body);

    const userId = body?.userId;

    if (!userId) {
      console.error("[/api/token] Missing userId in request body");
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const token = serverClient.createToken(userId);

    return NextResponse.json({
      userId,
      token,
    });
  } catch (error) {
    console.error("[/api/token] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
