import Link from "next/link";
import { getPosts } from "@/lib/store";
import { SECTIONS } from "@/lib/shared";

export default async function Home() {
	const posts = await getPosts();
	const recent = posts.slice(0, 6);
	return (
		<div className="grid gap-8">
			<section className="grid gap-2">
				<h1 className="text-2xl font-semibold">Welcome to Cortex Forum</h1>
				<p className="text-black/70 dark:text-white/70 max-w-2xl">Community discussions across technology, gaming, general and sports. AI curates a daily digest for newsletter subscribers.</p>
				<div className="flex gap-3 flex-wrap mt-2">
					{SECTIONS.map(s => (
						<Link key={s.key} href={`/section/${s.key}`} className="px-4 py-2 rounded border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">
							<div className="font-medium">{s.label}</div>
							<div className="text-xs text-black/60 dark:text-white/60">{s.description}</div>
						</Link>
					))}
				</div>
			</section>
			<section className="grid gap-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold">Recent posts</h2>
					<Link href="/newsletter" className="text-sm underline">Subscribe for daily digest</Link>
				</div>
				<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{recent.map(p => (
						<Link key={p.id} href={`/section/${p.section}#${p.id}`} className="block rounded border border-black/10 dark:border-white/15 p-4 hover:bg-black/5 dark:hover:bg-white/10">
							<div className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">{p.section}</div>
							<div className="font-medium mt-1">{p.title}</div>
							<div className="text-sm line-clamp-3 mt-1 text-black/70 dark:text-white/70">{p.content}</div>
						</Link>
					))}
					{recent.length === 0 && <div className="text-sm text-black/60 dark:text-white/60">No posts yet. Be the first to post in a section!</div>}
				</div>
			</section>
		</div>
	);
}