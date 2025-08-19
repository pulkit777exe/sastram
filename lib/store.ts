import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import type { ForumSection } from "./shared";
export { SECTIONS } from "./shared";

export interface ForumPost {
	id: string;
	section: ForumSection;
	author: string;
	title: string;
	content: string;
	tags?: string[];
	createdAt: string; // ISO string
}

export interface Subscriber {
	email: string;
	sections: ForumSection[];
	createdAt: string; // ISO
}

export interface DigestItem {
	postId: string;
	section: ForumSection;
	title: string;
	snippet: string;
	createdAt: string;
	category: "job" | "game-launch" | "news" | "other";
}

const DATA_DIR = path.join(process.cwd(), "data");
const NEWSLETTERS_DIR = path.join(DATA_DIR, "newsletters");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");

async function ensurePathExists(filePath: string) {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
}

async function ensureDataFiles() {
	await fs.mkdir(DATA_DIR, { recursive: true });
	await fs.mkdir(NEWSLETTERS_DIR, { recursive: true });
	try { await fs.access(POSTS_FILE); } catch { await fs.writeFile(POSTS_FILE, "[]", "utf8"); }
	try { await fs.access(SUBSCRIBERS_FILE); } catch { await fs.writeFile(SUBSCRIBERS_FILE, "[]", "utf8"); }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
	await ensurePathExists(filePath);
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return raw.trim() ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
	await ensurePathExists(filePath);
	await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function getPosts(section?: ForumSection): Promise<ForumPost[]> {
	await ensureDataFiles();
	const posts = await readJsonFile<ForumPost[]>(POSTS_FILE, []);
	if (!section) return posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return posts.filter(p => p.section === section).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addPost(post: Omit<ForumPost, "id" | "createdAt">): Promise<ForumPost> {
	await ensureDataFiles();
	const posts = await readJsonFile<ForumPost[]>(POSTS_FILE, []);
	const newPost: ForumPost = {
		id: randomUUID(),
		createdAt: new Date().toISOString(),
		...post
	};
	posts.push(newPost);
	await writeJsonFile(POSTS_FILE, posts);
	return newPost;
}

export async function getSubscribers(): Promise<Subscriber[]> {
	await ensureDataFiles();
	return readJsonFile<Subscriber[]>(SUBSCRIBERS_FILE, []);
}

export async function addSubscriber(email: string, sections: ForumSection[]): Promise<Subscriber> {
	await ensureDataFiles();
	const subscribers = await readJsonFile<Subscriber[]>(SUBSCRIBERS_FILE, []);
	const exists = subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
	const now = new Date().toISOString();
	if (exists) {
		exists.sections = Array.from(new Set([...(exists.sections || []), ...sections]));
		await writeJsonFile(SUBSCRIBERS_FILE, subscribers);
		return exists;
	}
	const newSubscriber: Subscriber = { email, sections: Array.from(new Set(sections)), createdAt: now };
	subscribers.push(newSubscriber);
	await writeJsonFile(SUBSCRIBERS_FILE, subscribers);
	return newSubscriber;
}

export interface DailyDigest {
	date: string; // YYYY-MM-DD
	items: DigestItem[];
}

export function categorizePost(section: ForumSection, title: string, content: string): DigestItem["category"] {
	const text = `${title}\n${content}`.toLowerCase();
	if (section === "technology") {
		if (/\b(hiring|job|contract|position|role|apply)\b/.test(text)) return "job";
		if (/\b(release|launched|v\d+|update|announcement)\b/.test(text)) return "news";
	}
	if (section === "gaming") {
		if (/\b(launch|released|preorder|trailer|dlc)\b/.test(text)) return "game-launch";
		if (/\b(patch|update|esports|tournament|review|news)\b/.test(text)) return "news";
	}
	return "other";
}

export async function buildDailyDigest(sinceMs: number = 24 * 60 * 60 * 1000): Promise<DailyDigest> {
	await ensureDataFiles();
	const posts = await getPosts();
	const cutoff = Date.now() - sinceMs;
	const recent = posts.filter(p => new Date(p.createdAt).getTime() >= cutoff);
	const items: DigestItem[] = recent.map(p => ({
		postId: p.id,
		section: p.section,
		title: p.title,
		snippet: (p.content || "").slice(0, 220),
		createdAt: p.createdAt,
		category: categorizePost(p.section, p.title, p.content)
	}));
	const date = new Date().toISOString().slice(0, 10);
	return { date, items };
}

export async function saveDailyDigest(digest: DailyDigest): Promise<string> {
	await ensureDataFiles();
	const file = path.join(NEWSLETTERS_DIR, `${digest.date}.json`);
	await writeJsonFile(file, digest);
	return file;
} 