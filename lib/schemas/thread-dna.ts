import { z } from 'zod';

// Source of truth for the shape stored in the Thread.threadDna JSON column.
export const threadDnaSchema = z.object({
  questionType: z.enum(['factual', 'opinion', 'technical', 'comparison', 'other']),
  expertiseLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  topics: z.array(z.string()).min(1).max(5),
  readTimeMinutes: z.number().int().min(1),
});

export type ThreadDNA = z.infer<typeof threadDnaSchema>;

// Rows predate the current schema (and the AI can drift), so bad data reads as "no DNA".
export function parseThreadDna(raw: unknown): ThreadDNA | null {
  if (raw === null || raw === undefined) return null;
  const result = threadDnaSchema.safeParse(raw);
  if (result.success) return result.data;
  return null;
}
