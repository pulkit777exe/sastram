"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, FileText, AlertCircle } from "lucide-react";

interface DigestItem {
	postId: string;
	section: string;
	title: string;
	snippet: string;
	createdAt: string;
	category: "job" | "game-launch" | "news" | "other";
}

interface DailyDigest {
	id: string;
	date: string;
	items: DigestItem[];
	processedAt: string;
	aiSummary?: string;
	sentToSubscribers: string[];
}

export default function DigestPreview() {
	const [digest, setDigest] = useState<DailyDigest | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	async function fetchDigest() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/digest");
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to fetch digest");
			setDigest(data.digest);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchDigest();
	}, []);

	const categoryColors = {
		job: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
		"game-launch": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
		news: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
		other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
	};

	if (loading) {
		return (
			<Card className="w-full">
				<CardContent className="flex items-center justify-center py-12">
					<div className="flex items-center gap-2">
						<RefreshCw className="h-5 w-5 animate-spin" />
						Loading digest...
					</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className="w-full">
				<CardContent className="flex items-center justify-center py-12">
					<div className="flex items-center gap-2 text-red-600">
						<AlertCircle className="h-5 w-5" />
						{error}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!digest) {
		return (
			<Card className="w-full">
				<CardContent className="text-center py-12">
					<FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
					<h3 className="text-lg font-semibold mb-2">No digest available</h3>
					<p className="text-muted-foreground mb-4">
						No daily digest has been generated yet.
					</p>
					<Button onClick={fetchDigest} variant="outline">
						<RefreshCw className="mr-2 h-4 w-4" />
						Refresh
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Calendar className="h-6 w-6 text-blue-600" />
						<div>
							<CardTitle>Daily Digest</CardTitle>
							<CardDescription>
								{new Date(digest.date).toLocaleDateString()} • {digest.items.length} posts
							</CardDescription>
						</div>
					</div>
					<Button onClick={fetchDigest} variant="outline" size="sm">
						<RefreshCw className="mr-2 h-4 w-4" />
						Refresh
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{digest.aiSummary && (
					<>
						<div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<h4 className="font-semibold mb-2">AI Summary</h4>
							<p className="text-sm text-muted-foreground">{digest.aiSummary}</p>
						</div>
						<Separator />
					</>
				)}

				<div className="space-y-4">
					<h4 className="font-semibold">Featured Posts</h4>
					{digest.items.map((item) => (
						<div key={item.postId} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
							<div className="flex items-start justify-between mb-2">
								<div className="flex items-center gap-2">
									<Badge variant="outline">{item.section}</Badge>
									<Badge className={categoryColors[item.category]}>
										{item.category}
									</Badge>
								</div>
								<span className="text-xs text-muted-foreground">
									{new Date(item.createdAt).toLocaleDateString()}
								</span>
							</div>
							<h5 className="font-medium mb-1">{item.title}</h5>
							<p className="text-sm text-muted-foreground line-clamp-2">
								{item.snippet}
							</p>
						</div>
					))}
				</div>

				{digest.items.length === 0 && (
					<div className="text-center py-8">
						<FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
						<p className="text-muted-foreground">No posts in today&apos;s digest</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
} 