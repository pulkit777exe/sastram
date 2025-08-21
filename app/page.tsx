import Link from "next/link";
import { getPosts } from "@/lib/store";
import { SECTIONS } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Users, TrendingUp, Zap, ArrowRight, Calendar } from "lucide-react";

export default async function Home() {
	const posts = await getPosts();
	const recent = posts.slice(0, 6);
	
	return (
		<div className="min-h-screen">
			{/* Hero Section */}
			<section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-20">
				<div className="container mx-auto px-4">
					<div className="text-center max-w-4xl mx-auto">
						<h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-6">
							Welcome to Sastram
						</h1>
						<p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
							Join the community-driven forum where technology, gaming, general discussions, and sports come together. 
							Get AI-curated daily digests delivered to your inbox.
						</p>
						<div className="flex flex-col sm:flex-row gap-4 justify-center">
							<Button asChild size="lg" className="text-lg px-8">
								<Link href="/section/technology">
									Start Exploring
									<ArrowRight className="ml-2 h-5 w-5" />
								</Link>
							</Button>
							<Button asChild variant="outline" size="lg" className="text-lg px-8">
								<Link href="/newsletter">
									Subscribe to Newsletter
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			{/* Features Section */}
			<section className="py-20 bg-background">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to stay connected</h2>
						<p className="text-xl text-muted-foreground max-w-2xl mx-auto">
							Discover, discuss, and stay updated with our AI-powered community platform
						</p>
					</div>
					
					<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
						<Card className="text-center">
							<CardHeader>
								<div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
									<MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
								</div>
								<CardTitle>Community Discussions</CardTitle>
								<CardDescription>
									Engage in meaningful conversations across technology, gaming, general topics, and sports
								</CardDescription>
							</CardHeader>
						</Card>

						<Card className="text-center">
							<CardHeader>
								<div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
									<Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
								</div>
								<CardTitle>AI-Powered Digests</CardTitle>
								<CardDescription>
									Get daily summaries of the most important posts and discussions delivered to your inbox
								</CardDescription>
							</CardHeader>
						</Card>

						<Card className="text-center">
							<CardHeader>
								<div className="mx-auto w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
									<TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
								</div>
								<CardTitle>Smart Categorization</CardTitle>
								<CardDescription>
									Posts are automatically categorized as jobs, launches, news, and more for easy discovery
								</CardDescription>
							</CardHeader>
						</Card>

						<Card className="text-center">
							<CardHeader>
								<div className="mx-auto w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mb-4">
									<Users className="h-6 w-6 text-orange-600 dark:text-orange-400" />
								</div>
								<CardTitle>Growing Community</CardTitle>
								<CardDescription>
									Join thousands of developers, gamers, and enthusiasts sharing knowledge and insights
								</CardDescription>
							</CardHeader>
						</Card>
					</div>
				</div>
			</section>

			<Separator />

			{/* Sections Grid */}
			<section className="py-20 bg-muted/30">
				<div className="container mx-auto px-4">
					<div className="text-center mb-16">
						<h2 className="text-3xl md:text-4xl font-bold mb-4">Explore Our Sections</h2>
						<p className="text-xl text-muted-foreground">
							Find your community in specialized discussion areas
						</p>
					</div>
					
					<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
						{SECTIONS.map(s => (
							<Card key={s.key} className="group hover:shadow-lg transition-all duration-300">
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										{s.label}
										<Badge variant="secondary">{s.key}</Badge>
									</CardTitle>
									<CardDescription>{s.description}</CardDescription>
								</CardHeader>
								<CardContent>
									<Button asChild className="w-full group-hover:bg-primary group-hover:text-primary-foreground">
										<Link href={`/section/${s.key}`}>
											Join Discussion
											<ArrowRight className="ml-2 h-4 w-4" />
										</Link>
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</section>

			<Separator />

			{/* Recent Posts */}
			<section className="py-20 bg-background">
				<div className="container mx-auto px-4">
					<div className="flex items-center justify-between mb-12">
						<div>
							<h2 className="text-3xl md:text-4xl font-bold mb-2">Recent Discussions</h2>
							<p className="text-muted-foreground">Latest posts from our community</p>
						</div>
						<Button asChild variant="outline">
							<Link href="/newsletter">
								<Calendar className="mr-2 h-4 w-4" />
								Daily Digest
							</Link>
						</Button>
					</div>
					
					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
						{recent.map(p => (
							<Card key={p.id} className="group hover:shadow-lg transition-all duration-300">
								<CardHeader>
									<div className="flex items-center justify-between mb-2">
										<Badge variant="outline">{p.section}</Badge>
										<span className="text-sm text-muted-foreground">
											{new Date(p.createdAt).toLocaleDateString()}
										</span>
									</div>
									<CardTitle className="line-clamp-2 group-hover:text-primary transition-colors">
										{p.title}
									</CardTitle>
									<CardDescription className="line-clamp-3">
										{p.content}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-between">
										<span className="text-sm text-muted-foreground">by {p.author}</span>
										<Button asChild variant="ghost" size="sm">
											<Link href={`/section/${p.section}#${p.id}`}>
												Read More
												<ArrowRight className="ml-1 h-3 w-3" />
											</Link>
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
						{recent.length === 0 && (
							<div className="col-span-full text-center py-12">
								<MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
								<h3 className="text-lg font-semibold mb-2">No posts yet</h3>
								<p className="text-muted-foreground mb-4">Be the first to start a conversation!</p>
								<Button asChild>
									<Link href="/section/technology">Create First Post</Link>
								</Button>
							</div>
						)}
					</div>
				</div>
			</section>
		</div>
	);
}
