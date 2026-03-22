import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/modules/auth/session";
import { ok, fail } from "@/lib/http/api-response";
import { submitAppeal } from "@/modules/appeals/actions";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();

    if (!body.reason) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "reason is required"),
        { status: 400 }
      );
    }

    // Create FormData object from request body
    const formData = new FormData();
    formData.append("reason", body.reason);
    if (body.reportId) {
      formData.append("reportId", body.reportId);
    }

    const result = await submitAppeal(formData);

    if (result.error) {
      return NextResponse.json(
        fail("INTERNAL_ERROR", result.error),
        { status: 500 }
      );
    }

    return NextResponse.json(ok({ appeal: { reason: body.reason, reportId: body.reportId } }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to submit appeal", error),
      { status: 500 }
    );
  }
}
