import { z } from "zod";
import { SectionRole } from "@prisma/client";

/**
 * Member validation schemas
 */

export const joinSectionSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
});

export const leaveSectionSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
});

export const inviteMemberSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
  email: z.string().email("Invalid email address"),
  role: z.nativeEnum(SectionRole).default("MEMBER"),
});

export const updateMemberRoleSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
  userId: z.string().cuid("Invalid user ID"),
  role: z.nativeEnum(SectionRole),
});

export const removeMemberSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
  userId: z.string().cuid("Invalid user ID"),
});

export const getSectionMembersSchema = z.object({
  sectionId: z.string().cuid("Invalid section ID"),
});

