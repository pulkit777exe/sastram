import { z } from "zod";

/**
 * User validation schemas
 */

export const updateUserProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters").optional(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  location: z.string().max(100, "Location must be less than 100 characters").optional(),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  twitter: z.string().max(50, "Twitter handle must be less than 50 characters").optional(),
  github: z.string().max(50, "GitHub username must be less than 50 characters").optional(),
  linkedin: z.string().max(50, "LinkedIn username must be less than 50 characters").optional(),
});

export const uploadAvatarSchema = z.object({
  avatar: z.instanceof(File, { message: "Avatar file is required" }),
});

export const uploadBannerSchema = z.object({
  banner: z.instanceof(File, { message: "Banner file is required" }),
});

export const updateProfilePrivacySchema = z.object({
  privacy: z.enum(["PUBLIC", "PRIVATE", "FOLLOWERS_ONLY"]),
});

