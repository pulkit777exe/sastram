export type ForumSection = "technology" | "gaming" | "general" | "sports";

export const SECTIONS: Array<{ key: ForumSection; label: string; description: string }> = [
	{ key: "technology", label: "Technology", description: "Dev talk, frameworks, AI, jobs, releases" },
	{ key: "gaming", label: "Gaming", description: "New launches, patches, esports, reviews" },
	{ key: "general", label: "General", description: "Anything goes. Community chat and updates" },
	{ key: "sports", label: "Sports", description: "Scores, transfers, events, discussions" }
]; 