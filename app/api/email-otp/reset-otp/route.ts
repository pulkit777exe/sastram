import { auth } from "@/lib/services/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const {email, otp, password} = await request.json();
    const data = await auth.api.resetPasswordEmailOTP({
        body: {
            email,
            otp,
            password
        },
    });
    return NextResponse.json(data, {status: 200});
}