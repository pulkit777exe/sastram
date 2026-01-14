import { NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { requireModerator } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

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
    const [latestStats, queueSize] = await Promise.all([
      prisma.moderationStats.findMany({
        orderBy: { windowStart: "desc" },
        take: 24,
      }),
      prisma.moderationQueue.count({
        where: { status: { in: ["QUEUED", "FLAGGED"] } },
      }),
    ]);

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

