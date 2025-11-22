import { z } from "zod";

export const emailSchema = z.string().email("Invalid email address");
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export const userProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters"),
  bio: z.string().max(160, "Bio must be less than 160 characters").optional(),
});

export const topicSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100, "Title must be less than 100 characters"),
  content: z.string().min(10, "Content must be at least 10 characters"),
});

export const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(1000, "Message must be less than 1000 characters"),
  sectionId: z.string().cuid("Invalid section ID"),
});

export function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, "");
}
