"use client";

import { useState, useTransition } from "react";
import type { ForumSection } from "@/lib/shared";

export default function SectionComposer({ section }: { section: ForumSection }) {
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [author, setAuthor] = useState("");
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	async function submit() {
		setError(null);
		setOk(null);
		try {
			const res = await fetch("/api/posts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ section, title, content, author })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to create post");
			setOk("Posted!");
			setTitle("");
			setContent("");
			setAuthor("");
			startTransition(() => {
				// Refresh the page data
				window.location.hash = `#${data.post.id}`;
				window.location.reload();
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}

	const disabled = pending || !title || !content || !author;
	return (
		<div className="rounded border border-black/10 dark:border-white/15 p-4 grid gap-3">
			<div className="grid gap-2 sm:grid-cols-2">
				<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="px-3 py-2 rounded border border-black/10 dark:border-white/15 bg-transparent" />
				<input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name" className="px-3 py-2 rounded border border-black/10 dark:border-white/15 bg-transparent" />
			</div>
			<textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Share your thoughts..." rows={4} className="px-3 py-2 rounded border border-black/10 dark:border-white/15 bg-transparent" />
			<div className="flex items-center gap-3">
				<button onClick={submit} disabled={disabled} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black">{pending ? "Posting..." : "Post"}</button>
				{ok && <span className="text-green-600 text-sm">{ok}</span>}
				{error && <span className="text-red-600 text-sm">{error}</span>}
			</div>
		</div>
	);
} 