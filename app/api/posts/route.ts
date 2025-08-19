import { NextRequest, NextResponse } from "next/server";
import { addPost, getPosts } from "@/lib/store";
import { SECTIONS, type ForumSection } from "@/lib/shared";

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const section = searchParams.get("section") as ForumSection | null;
	if (section && !SECTIONS.some(s => s.key === section)) {
		return NextResponse.json({ error: "Invalid section" }, { status: 400 });
	}
	const posts = await getPosts(section ?? undefined);
	return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { section, title, content, author, tags } = body || {};
		if (!section || !SECTIONS.some(s => s.key === section)) {
			return NextResponse.json({ error: "Section is required and must be valid" }, { status: 400 });
		}
		if (!title || !content || !author) {
			return NextResponse.json({ error: "Missing required fields: title, content, author" }, { status: 400 });
		}
		const created = await addPost({ section, title, content, author, tags: Array.isArray(tags) ? tags.slice(0, 8) : [] });
		return NextResponse.json({ post: created }, { status: 201 });
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}
} 