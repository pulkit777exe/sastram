import { NextRequest, NextResponse } from "next/server";
import { addSubscriber, getSubscribers } from "@/lib/store";
import { SECTIONS, type ForumSection } from "@/lib/shared";

export async function GET() {
	const subscribers = await getSubscribers();
	return NextResponse.json({ subscribers });
}

export async function POST(req: NextRequest) {
	try {
		const { email, sections } = await req.json();
		if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
		}
		const selected = Array.isArray(sections) ? sections.filter((s: ForumSection) => SECTIONS.some(x => x.key === s)) : [];
		if (selected.length === 0) {
			return NextResponse.json({ error: "At least one valid section required" }, { status: 400 });
		}
		const sub = await addSubscriber(email.trim().toLowerCase(), selected);
		return NextResponse.json({ subscriber: sub }, { status: 201 });
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}
} 