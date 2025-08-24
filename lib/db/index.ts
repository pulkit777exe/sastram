import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, desc, gte } from "drizzle-orm";
import { posts, subscribers, dailyDigests, type DigestItem } from "./schema";

if (!process.env.NEXT_PUBLIC_DATABASE_URL) {
  throw new Error("NEXT_PUBLIC_DATABASE_URL is not set");
}

const sql = neon(process.env.NEXT_PUBLIC_DATABASE_URL!);
export const db = drizzle(sql);

// Posts
export async function getPosts(section?: string) {
  if (section) {
    return await db.select().from(posts).where(eq(posts.section, section)).orderBy(desc(posts.createdAt));
  }
  return await db.select().from(posts).orderBy(desc(posts.createdAt));
}

export async function addPost(post: {
  section: string;
  title: string;
  content: string;
  author: string;
  tags?: string[];
}) {
  const [newPost] = await db.insert(posts).values(post).returning();
  return newPost;
}

export async function getSubscribers() {
  return await db.select().from(subscribers);
}

export async function addSubscriber(email: string, sections: string[]) {
  const existing = await db.select().from(subscribers).where(eq(subscribers.email, email));
  
  if (existing.length > 0) {
    const updatedSections = Array.from(new Set([...existing[0].sections, ...sections]));
    const [updated] = await db
      .update(subscribers)
      .set({ sections: updatedSections })
      .where(eq(subscribers.email, email))
      .returning();
    return updated;
  }
  
  const [newSubscriber] = await db.insert(subscribers).values({ email, sections }).returning();
  return newSubscriber;
}

export async function buildDailyDigest(sinceHours: number = 24) {
  const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const recentPosts = await db
    .select()
    .from(posts)
    .where(gte(posts.createdAt, cutoff))
    .orderBy(desc(posts.createdAt));
  
  const items: DigestItem[] = recentPosts.map(p => ({
    postId: p.id,
    section: p.section,
    title: p.title,
    snippet: p.content.slice(0, 220),
    createdAt: p.createdAt.toISOString(),
    category: categorizePost(p.section, p.title, p.content)
  }));
  
  return {
    date: new Date().toISOString().slice(0, 10),
    items
  };
}

export async function saveDailyDigest(digest: { date: string; items: DigestItem[] }, aiSummary?: string) {
  const [saved] = await db.insert(dailyDigests).values({
    date: digest.date,
    items: digest.items,
    aiSummary
  }).returning();
  return saved;
}

export async function getLatestDigest() {
  const [latest] = await db
    .select()
    .from(dailyDigests)
    .orderBy(desc(dailyDigests.processedAt))
    .limit(1);
  return latest;
}

function categorizePost(section: string, title: string, content: string): DigestItem["category"] {
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