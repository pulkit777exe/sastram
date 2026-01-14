import { NextRequest, NextResponse } from "next/server";
import { AppealsSystem } from "@/lib/services/moderation";
import { requireModerator } from "@/lib/middleware/moderation";
import { ok, fail } from "@/lib/http/api-response";

const appeals = new AppealsSystem();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await requireModerator();
    const body = await request.json();

    if (body.id != id) {
      return NextResponse.json(
        fail("ID_ERROR", "reset is required"),
        {
          status: 412
      })
    }

    if (!body.decision) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "decision is required"),
        { 
          status: 400
         }
      );
    }

    const appeal = await appeals.reviewAppeal({
      appealId: id,
      moderatorId: session.user.id,
      decision: body.decision,
      response: body.response,
    });

    return NextResponse.json(ok({ appeal }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to review appeal", error),
      { status: 500 }
    );
  }
}

