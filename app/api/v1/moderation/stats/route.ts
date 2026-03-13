import { NextResponse } from "next/server";
import { requireModerator } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

// TODO: ModerationStats and ModerationQueue models have been removed. Implement new stats system if needed.
export async function GET() {
  try {
    await requireModerator();
  } catch {
    return NextResponse.json(
      fail("AUTH_REQUIRED", "Moderator access required"),
      { status: 403 }
    );
  }

  try {
    // Return dummy data
    const latestStats: any[] = [];
    const queueSize = 0;

    return NextResponse.json(
      ok({
        latestStats,
        queueSize,
      })
    );
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to load moderation stats", error),
      { status: 500 }
    );
  }
}
