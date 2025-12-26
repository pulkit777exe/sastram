import { z } from "zod";
import { CONTENT_LIMITS } from "@/lib/config/constants";

/**
 * Topic validation schemas
 */

export const createTopicSchema = z.object({
  title: z.string()
    .min(CONTENT_LIMITS.TITLE_MIN_LENGTH, `Title must be at least ${CONTENT_LIMITS.TITLE_MIN_LENGTH} characters`)
    .max(CONTENT_LIMITS.TITLE_MAX_LENGTH, `Title must be less than ${CONTENT_LIMITS.TITLE_MAX_LENGTH} characters`),
  description: z.string()
    .max(CONTENT_LIMITS.DESCRIPTION_MAX_LENGTH, `Description must be less than ${CONTENT_LIMITS.DESCRIPTION_MAX_LENGTH} characters`)
    .optional(),
  icon: z.string().optional(),
});

