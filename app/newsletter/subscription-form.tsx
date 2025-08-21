"use client";

import { useState } from "react";
import { SECTIONS } from "@/lib/shared";
import type { ForumSection } from "@/lib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Mail, CheckCircle, AlertCircle, Bell, ArrowRight } from "lucide-react";

export default function NewsletterForm() {
	const [email, setEmail] = useState("");
	const [selected, setSelected] = useState<ForumSection[]>([]);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	async function submit() {
		setError(null);
		setOk(null);
		setPending(true);
		try {
			const res = await fetch("/api/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, sections: selected })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Failed to subscribe");
			setOk("Subscribed successfully! You'll receive daily digests.");
			setEmail("");
			setSelected([]);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setPending(false);
		}
	}

	const disabled = pending || !email || selected.length === 0;

	return (
		<Card className="w-full max-w-2xl mx-auto">
			<CardHeader className="text-center">
				<div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
					<Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<CardTitle className="text-2xl">Subscribe to Daily Digest</CardTitle>
				<CardDescription>
					Get AI-curated summaries of the most important discussions delivered to your inbox every day
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					<label htmlFor="email" className="text-sm font-medium">Email Address</label>
					<Input
						id="email"
						type="email"
						value={email}
						onChange={e => setEmail(e.target.value)}
						placeholder="your@email.com"
						className="w-full"
					/>
				</div>

				<Separator />

				<div className="space-y-4">
					<label className="text-sm font-medium">Select Sections</label>
					<div className="grid gap-3">
						{SECTIONS.map(s => (
							<div key={s.key} className="flex items-center space-x-3">
								<Checkbox
									id={s.key}
									checked={selected.includes(s.key as ForumSection)}
									onCheckedChange={(checked) => {
										if (checked) {
											setSelected(prev => [...prev, s.key as ForumSection]);
										} else {
											setSelected(prev => prev.filter(x => x !== s.key));
										}
									}}
								/>
								<label htmlFor={s.key} className="flex-1 cursor-pointer">
									<div className="flex items-center justify-between">
										<div>
											<div className="font-medium">{s.label}</div>
											<div className="text-sm text-muted-foreground">{s.description}</div>
										</div>
										<Badge variant="outline">{s.key}</Badge>
									</div>
								</label>
							</div>
						))}
					</div>
				</div>

				<Separator />

				<div className="space-y-4">
					<Button 
						onClick={submit} 
						disabled={disabled} 
						className="w-full flex items-center gap-2"
						size="lg"
					>
						{pending ? (
							<>
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
								Subscribing...
							</>
						) : (
							<>
								<Mail className="h-4 w-4" />
								Subscribe to Newsletter
								<ArrowRight className="h-4 w-4" />
							</>
						)}
					</Button>
					
					{ok && (
						<div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
							<CheckCircle className="h-4 w-4" />
							{ok}
						</div>
					)}
					{error && (
						<div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<AlertCircle className="h-4 w-4" />
							{error}
						</div>
					)}
				</div>

				<div className="text-xs text-muted-foreground text-center">
					You can unsubscribe at any time. We respect your privacy and will never share your email.
				</div>
			</CardContent>
		</Card>
	);
} 