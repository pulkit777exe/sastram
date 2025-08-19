import { NextResponse } from "next/server";
import { buildDailyDigest, saveDailyDigest } from "@/lib/store";

export async function POST() {
	const digest = await buildDailyDigest();
	await saveDailyDigest(digest);
	return NextResponse.json({ digest });
}

export async function GET() {
	const digest = await buildDailyDigest();
	return NextResponse.json({ digest });
} 