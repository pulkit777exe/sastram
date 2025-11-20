import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { email, type } = await request.json();
  const data = await auth.api.sendVerificationOTP({
    body: {
      email,
      type,
    },
  });
  return NextResponse.json(data, {status: 200 });
}
