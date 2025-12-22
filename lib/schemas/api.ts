import { z } from "zod";

/**
 * File upload validation schemas
 */
export const fileUploadSchema = z.object({
  files: z
    .array(
      z.instanceof(File).refine(
        (file) => {
          const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "application/pdf",
          ];
          return allowedTypes.includes(file.type);
        },
        {
          message:
            "Invalid file type. Allowed: images, GIFs, videos (MP4/WebM), and PDFs.",
        }
      )
    )
    .min(1, "At least one file is required")
    .max(10, "Maximum 10 files allowed"),
});

export const uploadedFileSchema = z.object({
  url: z.string().url(),
  type: z.enum(["IMAGE", "GIF", "FILE", "VIDEO"]),
  name: z.string(),
  size: z.number().int().positive(),
});

export const uploadResponseSchema = z.object({
  files: z.array(uploadedFileSchema),
});

/**
 * Thread/Section schemas
 */
export const createThreadRequestSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z
    .string()
    .max(480, "Description must be less than 480 characters")
    .optional()
    .or(z.literal("")),
  communityId: z
    .string()
    .cuid("Invalid community ID")
    .optional()
    .or(z.literal("")),
});

export const threadSummarySchema = z.object({
  id: z.string().cuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  community: z
    .object({
      id: z.string().cuid(),
      title: z.string(),
      slug: z.string(),
    })
    .nullable()
    .optional(),
  messageCount: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  icon: z.string().nullable().optional(),
});

export const threadDetailSchema = threadSummarySchema.extend({
  messages: z.array(
    z.object({
      id: z.string().cuid(),
      content: z.string(),
      senderId: z.string().cuid(),
      senderName: z.string(),
      senderAvatar: z.string().url().nullable().optional(),
      createdAt: z.coerce.date(),
    })
  ),
  summary: z.string().nullable().optional(),
  subscriptionCount: z.number().int().nonnegative().optional(),
});

/**
 * Community schemas
 */
export const createCommunityRequestSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z
    .string()
    .max(280, "Description must be less than 280 characters")
    .optional()
    .or(z.literal("")),
});

export const communitySummarySchema = z.object({
  id: z.string().cuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  threadCount: z.number().int().nonnegative(),
});

/**
 * Conversation schemas
 */
export const conversationSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  avatar: z.string().url(),
  lastMessage: z.string(),
  timestamp: z.string(),
  unread: z.number().int().nonnegative(),
  online: z.boolean(),
  type: z.enum(["channel", "dm"]),
});

/**
 * Standardized API error response
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  validationErrors: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
      })
    )
    .optional(),
});

/**
 * Standardized API success response
 */
export function createSuccessResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T
) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

/**
 * Generic action response schema
 */
export function createActionResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T
) {
  return z.union([
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      success: z.literal(false),
      error: z.string(),
    }),
  ]);
}

/**
 * Pagination schemas
 */
export const paginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
  });

/**
 * Type exports
 */
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type ThreadDetail = z.infer<typeof threadDetailSchema>;
export type CreateCommunityRequest = z.infer<
  typeof createCommunityRequestSchema
>;
export type CommunitySummary = z.infer<typeof communitySummarySchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type PaginationParams = z.infer<typeof paginationParamsSchema>;
