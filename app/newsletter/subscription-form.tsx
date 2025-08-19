"use client";

import { useState } from "react";
import { SECTIONS } from "@/lib/shared";
import type { ForumSection } from "@/lib/shared";

export default function NewsletterForm() {
	const [email, setEmail] = useState("");
	const [selected, setSelected] = useState<ForumSection[]>(["technology", "gaming"]);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	function toggle(section: ForumSection) {
		setSelected(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]);
	}

	async function subscribe() {
		setStatus(null);
		setError(null);
		try {
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, sections: selected })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to subscribe");
			setStatus("You're subscribed!");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}

	return (
		<div className="rounded border border-black/10 dark:border-white/15 p-4 grid gap-3">
			<div className="grid gap-2">
				<label className="text-sm">Email</label>
				<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="px-3 py-2 rounded border border-black/10 dark:border-white/15 bg-transparent" />
			</div>
			<div className="grid gap-2">
				<label className="text-sm">Sections</label>
				<div className="flex flex-wrap gap-2">
					{SECTIONS.map(s => (
						<button key={s.key} type="button" onClick={() => toggle(s.key)} className={`px-3 py-1.5 rounded border ${selected.includes(s.key) ? "bg-black text-white dark:bg-white dark:text-black border-transparent" : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"}`}>
							{s.label}
						</button>
					))}
				</div>
			</div>
			<div className="flex items-center gap-3">
				<button onClick={subscribe} disabled={!email || selected.length === 0} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50 dark:bg-white dark:text-black">Subscribe</button>
				{status && <span className="text-green-600 text-sm">{status}</span>}
				{error && <span className="text-red-600 text-sm">{error}</span>}
			</div>
		</div>
	);
} 