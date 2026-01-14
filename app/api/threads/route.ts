import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/services/auth";
import { listThreads } from "@/modules/threads/repository";
import { ok, fail } from "@/lib/http/api-response";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const requestId = request.headers.get("x-request-id") ?? "";

  if (!session) {
    return NextResponse.json(
      fail("AUTH_REQUIRED", "Unauthorized", undefined, requestId),
      { status: 401 }
    );
  }

  try {
    const threads = await listThreads();
    return NextResponse.json(ok({ threads }, requestId));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Failed to load threads", undefined, requestId),
      { status: 500 }
    );
  }
}

