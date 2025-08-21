import NewsletterForm from "./subscription-form";
import DigestPreview from "./preview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bell, FileText } from "lucide-react";

export default function NewsletterPage() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="max-w-6xl mx-auto space-y-8">
				{/* Page Header */}
				<div className="text-center space-y-4">
					<div className="flex items-center justify-center gap-3">
						<Bell className="h-8 w-8 text-blue-600" />
						<h1 className="text-3xl md:text-4xl font-bold">Newsletter & Daily Digest</h1>
					</div>
					<p className="text-xl text-muted-foreground max-w-2xl mx-auto">
						Stay updated with AI-curated summaries of the most important discussions from our community
					</p>
				</div>

				<Separator />

				{/* Content Grid */}
				<div className="grid lg:grid-cols-2 gap-8">
					{/* Subscription Form */}
					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Bell className="h-5 w-5" />
									Subscribe to Daily Digest
								</CardTitle>
								<CardDescription>
									Get the most important posts and discussions delivered to your inbox every day
								</CardDescription>
							</CardHeader>
							<CardContent>
								<NewsletterForm />
							</CardContent>
						</Card>
					</div>

					{/* Digest Preview */}
					<div className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FileText className="h-5 w-5" />
									Latest Digest Preview
								</CardTitle>
								<CardDescription>
									See what our AI has curated from recent community discussions
								</CardDescription>
							</CardHeader>
							<CardContent>
								<DigestPreview />
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Features */}
				<div className="grid md:grid-cols-3 gap-6 mt-12">
					<Card className="text-center">
						<CardHeader>
							<div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
								<Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
							</div>
							<CardTitle>Daily Delivery</CardTitle>
							<CardDescription>
								Get your personalized digest every day at 6 PM UTC
							</CardDescription>
						</CardHeader>
					</Card>

					<Card className="text-center">
						<CardHeader>
							<div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
								<FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
							</div>
							<CardTitle>AI Curated</CardTitle>
							<CardDescription>
								Smart categorization of jobs, launches, news, and more
							</CardDescription>
						</CardHeader>
					</Card>

					<Card className="text-center">
						<CardHeader>
							<div className="mx-auto w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
								<Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
							</div>
							<CardTitle>Section Specific</CardTitle>
							<CardDescription>
								Choose which sections you want to follow
							</CardDescription>
						</CardHeader>
					</Card>
				</div>
			</div>
		</div>
	);
} 