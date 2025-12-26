import { auth } from "@/lib/services/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { email } = await request.json();
  const data = await auth.api.forgetPasswordEmailOTP({
    body: {
      email,
    },
  });
  return NextResponse.json(data, {status: 200});
}