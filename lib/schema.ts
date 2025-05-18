import { pgTable, text, timestamp, integer, uuid, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  votes: integer('votes').default(0),
  views: integer('views').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const questionsRelations = relations(questions, ({ many }) => ({
  answers: many(answers),
  tags: many(questionTags),
  bookmarks: many(bookmarks),
  votes: many(votes),
}));

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').references(() => questions.id).notNull(),
  content: text('content').notNull(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  votes: integer('votes').default(0),
  isAccepted: boolean('is_accepted').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const answersRelations = relations(answers, ({ one, many }) => ({
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
  votes: many(votes),
}));

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
});

export const tagsRelations = relations(tags, ({ many }) => ({
  questions: many(questionTags),
}));

export const questionTags = pgTable('question_tags', {
  questionId: uuid('question_id').references(() => questions.id).notNull(),
  tagId: uuid('tag_id').references(() => tags.id).notNull(),
});

export const questionTagsRelations = relations(questionTags, ({ one }) => ({
  question: one(questions, {
    fields: [questionTags.questionId],
    references: [questions.id],
  }),
  tag: one(tags, {
    fields: [questionTags.tagId],
    references: [tags.id],
  }),
}));

export const bookmarks = pgTable('bookmarks', {
  userId: text('user_id').notNull(),
  questionId: uuid('question_id').references(() => questions.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  question: one(questions, {
    fields: [bookmarks.questionId],
    references: [questions.id],
  }),
}));

export const votes = pgTable('votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  questionId: uuid('question_id').references(() => questions.id),
  answerId: uuid('answer_id').references(() => answers.id),
  value: integer('value').notNull(), // 1 for upvote, -1 for downvote
  createdAt: timestamp('created_at').defaultNow(),
});

export const votesRelations = relations(votes, ({ one }) => ({
  question: one(questions, {
    fields: [votes.questionId],
    references: [questions.id],
  }),
  answer: one(answers, {
    fields: [votes.answerId],
    references: [answers.id],
  }),
})); 