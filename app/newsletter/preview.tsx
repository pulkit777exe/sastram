"use client";

import { useState } from "react";

interface DigestItem {
	postId: string;
	section: string;
	title: string;
	snippet: string;
	createdAt: string;
	category: "job" | "game-launch" | "news" | "other";
}

interface DailyDigest {
	date: string;
	items: DigestItem[];
}

export default function DigestPreview() {
	const [digest, setDigest] = useState<DailyDigest | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function load() {
		setLoading(true);
		setDigest(null);
		setError(null);
		try {
			const res = await fetch("/api/digest", { method: "GET" });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to build digest");
			setDigest(data.digest as DailyDigest);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="rounded border border-black/10 dark:border-white/15 p-4 grid gap-3">
			<div className="flex items-center justify-between">
				<h2 className="font-medium">Latest 24h Digest (preview)</h2>
				<button onClick={load} className="px-3 py-1.5 rounded bg-black text-white dark:bg-white dark:text-black">{loading ? "Loading..." : "Refresh"}</button>
			</div>
			{error && <div className="text-red-600 text-sm">{error}</div>}
			{digest && (
				<div className="grid gap-3">
					<div className="text-sm text-black/60 dark:text-white/60">{digest.items.length} items, date {digest.date}</div>
					<div className="grid gap-2">
						{digest.items.map((it) => (
							<div key={it.postId} className="rounded border border-black/10 dark:border-white/15 p-3">
								<div className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">{it.section} • {it.category}</div>
								<div className="font-medium mt-1">{it.title}</div>
								<div className="text-sm mt-1">{it.snippet}</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
} 