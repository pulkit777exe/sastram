import { getPosts } from "@/lib/store";
import { SECTIONS, type ForumSection } from "@/lib/shared";
import SectionComposer from "./section-composer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, User, Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
	const { section } = await params;
	if (!SECTIONS.some(s => s.key === section)) {
		return <div className="container mx-auto px-4 py-8">Section not found</div>;
	}
	
	const posts = await getPosts(section as ForumSection);
	const sectionInfo = SECTIONS.find(s => s.key === section)!;
	
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="max-w-4xl mx-auto space-y-8">
				{/* Section Header */}
				<div className="text-center space-y-4">
					<div className="flex items-center justify-center gap-3">
						<MessageSquare className="h-8 w-8 text-blue-600" />
						<h1 className="text-3xl md:text-4xl font-bold">{sectionInfo.label}</h1>
						<Badge variant="secondary" className="text-lg px-3 py-1">{section}</Badge>
					</div>
					<p className="text-xl text-muted-foreground max-w-2xl mx-auto">
						{sectionInfo.description}
					</p>
				</div>
				
				<Separator />
				
				{/* Composer */}
				<SectionComposer section={section as ForumSection} />
				
				<Separator />
				
				{/* Posts */}
				<div className="space-y-6">
					<div className="flex items-center justify-between">
						<h2 className="text-2xl font-semibold flex items-center gap-2">
							<MessageSquare className="h-6 w-6" />
							Discussions ({posts.length})
						</h2>
						<Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
							← Back to Home
						</Link>
					</div>
					
					<div className="space-y-4">
						{posts.map(p => (
							<Card key={p.id} className="group hover:shadow-lg transition-all duration-300">
								<CardHeader>
									<div className="flex items-start justify-between">
										<div className="space-y-2">
											<CardTitle className="group-hover:text-primary transition-colors">
												{p.title}
											</CardTitle>
											<CardDescription className="line-clamp-3">
												{p.content}
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-between text-sm text-muted-foreground">
										<div className="flex items-center gap-4">
											<div className="flex items-center gap-1">
												<User className="h-4 w-4" />
												{p.author}
											</div>
											<div className="flex items-center gap-1">
												<Calendar className="h-4 w-4" />
												{new Date(p.createdAt).toLocaleDateString()}
											</div>
										</div>
										<Link 
											href={`#${p.id}`} 
											className="flex items-center gap-1 text-primary hover:underline"
										>
											Read More
											<ArrowRight className="h-3 w-3" />
										</Link>
									</div>
								</CardContent>
							</Card>
						))}
						
						{posts.length === 0 && (
							<Card className="text-center py-12">
								<CardContent>
									<MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
									<h3 className="text-lg font-semibold mb-2">No posts yet in {sectionInfo.label}</h3>
									<p className="text-muted-foreground mb-4">
										Be the first to start a conversation in this section!
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</div>
		</div>
	);
} 