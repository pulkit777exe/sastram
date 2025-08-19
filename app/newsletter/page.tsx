import NewsletterForm from "./subscription-form";
import DigestPreview from "./preview";

export default function NewsletterPage() {
	return (
		<div className="grid gap-6 max-w-2xl">
			<div>
				<h1 className="text-2xl font-semibold">Newsletter</h1>
				<p className="text-black/70 dark:text-white/70">Subscribe to receive a daily AI-curated digest from the sections you care about.</p>
			</div>
			<NewsletterForm />
			<DigestPreview />
		</div>
	);
} 