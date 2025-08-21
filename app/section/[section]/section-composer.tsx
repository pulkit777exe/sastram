"use client";

import { useState, useTransition } from "react";
import type { ForumSection } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, AlertCircle, CheckCircle } from "lucide-react";

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
			setOk("Posted successfully!");
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
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MessageSquare className="h-5 w-5" />
					Create New Post
				</CardTitle>
				<CardDescription>
					Share your thoughts with the community in the <Badge variant="secondary">{section}</Badge> section
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<label htmlFor="title" className="text-sm font-medium">Title</label>
						<Input
							id="title"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="Enter your post title..."
							className="w-full"
						/>
					</div>
					<div className="space-y-2">
						<label htmlFor="author" className="text-sm font-medium">Your Name</label>
						<Input
							id="author"
							value={author}
							onChange={e => setAuthor(e.target.value)}
							placeholder="Enter your name..."
							className="w-full"
						/>
					</div>
				</div>
				
				<div className="space-y-2">
					<label htmlFor="content" className="text-sm font-medium">Content</label>
					<Textarea
						id="content"
						value={content}
						onChange={e => setContent(e.target.value)}
						placeholder="Share your thoughts, questions, or insights..."
						rows={4}
						className="w-full resize-none"
					/>
				</div>
				
				<div className="flex items-center gap-3">
					<Button 
						onClick={submit} 
						disabled={disabled} 
						className="flex items-center gap-2"
					>
						{pending ? (
							<>
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
								Posting...
							</>
						) : (
							<>
								<Send className="h-4 w-4" />
								Post
							</>
						)}
					</Button>
					
					{ok && (
						<div className="flex items-center gap-2 text-green-600 text-sm">
							<CheckCircle className="h-4 w-4" />
							{ok}
						</div>
					)}
					{error && (
						<div className="flex items-center gap-2 text-red-600 text-sm">
							<AlertCircle className="h-4 w-4" />
							{error}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
} 