export default function Skeleton({ lines = 3 }: { lines?: number }) {
	return (
		<div className="animate-pulse">
			{Array.from({ length: lines }).map((_, i) => (
				<div key={i} className="h-4 bg-black/10 dark:bg-white/15 rounded mb-2" style={{ width: `${90 - i * 10}%` }} />
			))}
		</div>
	);
} 