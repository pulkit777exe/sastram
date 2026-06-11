import { z } from 'zod';

/**
 * ThreadDNA Zod schema — validates the JSON field from Thread.threadDna.
 * This is the single source of truth for ThreadDNA shape.
 */
export const threadDnaSchema = z.object({
  questionType: z.enum(['factual', 'opinion', 'technical', 'comparison', 'other']),
  expertiseLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  topics: z.array(z.string()).min(1).max(5),
  readTimeMinutes: z.number().int().min(1),
});

export type ThreadDNA = z.infer<typeof threadDnaSchema>;

/**
 * Safely parse a Prisma Json value into ThreadDNA.
 * Returns null if the value is null/undefined or fails validation.
 */
export function parseThreadDna(raw: unknown): ThreadDNA | null {
  if (raw === null || raw === undefined) return null;
  const result = threadDnaSchema.safeParse(raw);
  return result.success ? result.data : null;
}
