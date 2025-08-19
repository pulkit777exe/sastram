import { notFound } from "next/navigation";
import { getPosts } from "@/lib/store";
import { SECTIONS, type ForumSection } from "@/lib/shared";
import SectionComposer from "./section-composer";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
	const { section } = await params;
	const sec = SECTIONS.find(s => s.key === section);
	if (!sec) return notFound();
	const posts = await getPosts(sec.key as ForumSection);
	return (
		<div className="grid gap-6">
			<div>
				<h1 className="text-2xl font-semibold">{sec.label}</h1>
				<p className="text-black/70 dark:text-white/70">{sec.description}</p>
			</div>
			<SectionComposer section={sec.key} />
			<div className="grid gap-3">
				{posts.map(p => (
					<article key={p.id} id={p.id} className="rounded border border-black/10 dark:border-white/15 p-4">
						<div className="text-xs text-black/60 dark:text-white/60">By {p.author} on {new Date(p.createdAt).toLocaleString()}</div>
						<h3 className="font-medium mt-1">{p.title}</h3>
						<p className="text-sm mt-1 whitespace-pre-wrap">{p.content}</p>
					</article>
				))}
				{posts.length === 0 && <div className="text-sm text-black/60 dark:text-white/60">No posts yet. Start the conversation above.</div>}
			</div>
		</div>
	);
} 