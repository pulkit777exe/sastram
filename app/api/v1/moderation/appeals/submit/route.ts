import { NextRequest, NextResponse } from "next/server";
import { AppealsSystem } from "@/lib/services/moderation";
import { requireSession } from "@/modules/auth/session";
import { ok, fail } from "@/lib/http/api-response";

const appeals = new AppealsSystem();

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    if (!body.messageId || !body.reason) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "messageId and reason are required"),
        { status: 400 }
      );
    }

    const appeal = await appeals.submitAppeal({
      messageId: body.messageId,
      userId: session.user.id,
      reason: body.reason,
    });

    return NextResponse.json(ok({ appeal }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to submit appeal", error),
      { status: 500 }
    );
  }
}

