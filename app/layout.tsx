import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SECTIONS } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Sastram",
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
				<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					<div className="container mx-auto px-4">
						<div className="flex h-16 items-center justify-between">
							<Link href="/" className="flex items-center space-x-2">
								<div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
									<span className="text-white font-bold text-sm">S</span>
								</div>
								<span className="font-semibold text-xl">Sastram</span>
							</Link>
							
							<nav className="hidden md:flex items-center space-x-6">
								{SECTIONS.map(s => (
									<Link key={s.key} href={`/section/${s.key}`}>
										<Button variant="ghost" size="sm" className="flex items-center space-x-2">
											<span>{s.label}</span>
											<Badge variant="secondary" className="text-xs">{s.key}</Badge>
										</Button>
									</Link>
								))}
							</nav>
							
							<div className="flex items-center space-x-4">
								<Button asChild variant="outline" size="sm">
									<Link href="/newsletter">Newsletter</Link>
								</Button>
								<Button asChild size="sm">
									<Link href="/section/technology">Get Started</Link>
								</Button>
							</div>
						</div>
					</div>
				</header>
				
				<main>
					{children}
				</main>
				
				<Separator />
				<footer className="bg-muted/30">
					<div className="container mx-auto px-4 py-12">
						<div className="grid md:grid-cols-4 gap-8">
							<div className="space-y-4">
								<Link href="/" className="flex items-center space-x-2">
									<div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
										<span className="text-white font-bold text-sm">S</span>
									</div>
									<span className="font-semibold text-lg">Sastram</span>
								</Link>
								<p className="text-sm text-muted-foreground">
									Community-driven forum with AI-assisted daily digests.
								</p>
							</div>
							
							<div>
								<h3 className="font-semibold mb-4">Sections</h3>
								<ul className="space-y-2 text-sm">
									{SECTIONS.map(s => (
										<li key={s.key}>
											<Link href={`/section/${s.key}`} className="text-muted-foreground hover:text-foreground transition-colors">
												{s.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
							
							<div>
								<h3 className="font-semibold mb-4">Resources</h3>
								<ul className="space-y-2 text-sm">
									<li>
										<Link href="/newsletter" className="text-muted-foreground hover:text-foreground transition-colors">
											Newsletter
										</Link>
									</li>
									<li>
										<Link href="/api/digest" className="text-muted-foreground hover:text-foreground transition-colors">
											Daily Digest
										</Link>
									</li>
								</ul>
							</div>
							
							<div>
								<h3 className="font-semibold mb-4">Community</h3>
								<ul className="space-y-2 text-sm">
									<li>
										<Link href="/section/technology" className="text-muted-foreground hover:text-foreground transition-colors">
											Start Discussion
										</Link>
									</li>
									<li>
										<Link href="/newsletter" className="text-muted-foreground hover:text-foreground transition-colors">
											Subscribe
										</Link>
									</li>
								</ul>
							</div>
						</div>
						
						<Separator className="my-8" />
						
						<div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
							<p className="text-sm text-muted-foreground">
								© {new Date().getFullYear()} Sastram. All rights reserved.
							</p>
							<div className="flex items-center space-x-4 text-sm text-muted-foreground">
								<span>Powered by AI</span>
								<span>•</span>
								<span>Built with Next.js</span>
							</div>
						</div>
					</div>
				</footer>
			</body>
		</html>
	);
}
