import Skeleton from "@/app/_components/Skeleton";

export default function Loading() {
	return (
		<div className="grid gap-6">
			<div>
				<div className="h-6 w-48 bg-black/10 dark:bg-white/15 rounded" />
				<div className="h-4 w-80 bg-black/10 dark:bg-white/15 rounded mt-2" />
			</div>
			<div className="rounded border border-black/10 dark:border-white/15 p-4">
				<Skeleton lines={5} />
			</div>
			<div className="space-y-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={i} className="rounded border border-black/10 dark:border-white/15 p-4">
						<Skeleton lines={4} />
					</div>
				))}
			</div>
		</div>
	);
} 