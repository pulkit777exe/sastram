import type { ForumSection } from "./shared";
export { SECTIONS } from "./shared";

// Re-export database functions to maintain compatibility
export { 
  getPosts, 
  addPost, 
  getSubscribers, 
  addSubscriber, 
  buildDailyDigest, 
  saveDailyDigest,
  getLatestDigest 
} from "./db";

export interface ForumPost {
  id: string;
  section: ForumSection;
  author: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  sections: ForumSection[];
  createdAt: string;
}

export interface DigestItem {
  postId: string;
  section: ForumSection;
  title: string;
  snippet: string;
  createdAt: string;
  category: "job" | "game-launch" | "news" | "other";
}

export interface DailyDigest {
  id: string;
  date: string;
  items: DigestItem[];
  processedAt: string;
  aiSummary?: string;
  sentToSubscribers: string[];
}

// Legacy functions for backward compatibility
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