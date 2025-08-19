import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SECTIONS } from "@/lib/shared";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Cortex Forum",
	description: "Community-driven forum with AI-assisted digests",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
				<header className="border-b border-black/10 dark:border-white/10 sticky top-0 z-40 bg-background/80 backdrop-blur">
					<div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
						<Link href="/" className="font-semibold text-lg">Cortex Forum</Link>
						<nav className="flex items-center gap-3 text-sm">
							{SECTIONS.map(s => (
								<Link key={s.key} href={`/section/${s.key}`} className="px-3 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10">
									{s.label}
								</Link>
							))}
							<Link href="/newsletter" className="px-3 py-1.5 rounded bg-black text-white dark:bg-white dark:text-black">Newsletter</Link>
						</nav>
					</div>
				</header>
				<main className="max-w-6xl mx-auto px-4 py-6">
					{children}
				</main>
				<footer className="border-t border-black/10 dark:border-white/10 mt-8">
					<div className="max-w-6xl mx-auto px-4 py-6 text-sm text-black/60 dark:text-white/60">
						© {new Date().getFullYear()} Cortex Forum
					</div>
				</footer>
			</body>
		</html>
	);
}
