import { pgTable, text, timestamp, uuid, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  section: varchar("section", { length: 50 }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  sections: jsonb("sections").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyDigests = pgTable("daily_digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  items: jsonb("items").$type<DigestItem[]>().notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  aiSummary: text("ai_summary"),
  sentToSubscribers: jsonb("sent_to_subscribers").$type<string[]>().default([]), // email list
});

export type DigestItem = {
  postId: string;
  section: string;
  title: string;
  snippet: string;
  createdAt: string;
  category: "job" | "game-launch" | "news" | "other";
}

// Zod schemas for validation
export const insertPostSchema = createInsertSchema(posts);
export const selectPostSchema = createSelectSchema(posts);
export const insertSubscriberSchema = createInsertSchema(subscribers);
export const selectSubscriberSchema = createSelectSchema(subscribers);

export type Post = z.infer<typeof selectPostSchema>;
export type NewPost = z.infer<typeof insertPostSchema>;
export type Subscriber = z.infer<typeof selectSubscriberSchema>;
export type NewSubscriber = z.infer<typeof insertSubscriberSchema>; 