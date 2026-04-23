import { NextRequest, NextResponse } from "next/server";
import { processPendingDigests } from "@/modules/newsletter/service";
import { logger } from "@/lib/infrastructure/logger";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await processPendingDigests();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error generating newsletter:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
