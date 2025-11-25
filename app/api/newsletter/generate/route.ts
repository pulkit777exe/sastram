import { NextResponse } from "next/server";
import { processPendingDigests } from "@/modules/newsletter/service";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    await processPendingDigests();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error generating newsletter:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
