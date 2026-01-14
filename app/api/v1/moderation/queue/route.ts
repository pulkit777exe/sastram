import { NextRequest, NextResponse } from "next/server";
import { ModerationDashboard } from "@/lib/services/moderation";
import { requireModerator } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

const dashboard = new ModerationDashboard();

export async function GET(request: NextRequest) {
  try {
    await requireModerator();
  } catch {
    return NextResponse.json(
      fail("AUTH_REQUIRED", "Moderator access required"),
      { status: 403 }
    );
  }

  const status = request.nextUrl.searchParams.get("status") as any;

  try {
    const queue = await dashboard.getQueue({ status });
    return NextResponse.json(ok({ items: queue }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to load moderation queue", error),
      { status: 500 }
    );
  }
}

