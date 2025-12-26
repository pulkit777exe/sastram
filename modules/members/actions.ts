"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { SectionRole } from "@prisma/client";
import {
  addMember,
  removeMember,
  updateMemberRole,
  getSectionMembers,
  getMemberRole,
} from "@/modules/members/repository";
import { createNotification } from "@/modules/notifications/repository";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  joinSectionSchema,
  leaveSectionSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  removeMemberSchema,
  getSectionMembersSchema,
} from "./schemas";

export async function joinSection(sectionId: string) {
  const session = await requireSession();

  const validation = validate(joinSectionSchema, { sectionId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if already a member
    const existing = await getMemberRole(sectionId, session.user.id);
    if (existing && existing.status === "ACTIVE") {
      return { error: "Already a member" };
    }

    await addMember(sectionId, session.user.id, "MEMBER");

    // Update member count
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        memberCount: {
          increment: 1,
        },
      },
    });

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function leaveSection(sectionId: string) {
  const session = await requireSession();

  const validation = validate(leaveSectionSchema, { sectionId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await removeMember(sectionId, session.user.id);

    // Update member count
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function inviteMember(
  sectionId: string,
  email: string,
  role: SectionRole = "MEMBER"
) {
  const session = await requireSession();

  const validation = validate(inviteMemberSchema, { sectionId, email, role });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if user has permission (must be owner or moderator)
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || !["OWNER", "MODERATOR"].includes(memberRole.role)) {
      return { error: "Insufficient permissions" };
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { error: "User not found" };
    }

    // Add as member
    await addMember(sectionId, user.id, role);

    // Create notification
    await createNotification({
      userId: user.id,
      type: "INVITATION",
      title: "Section Invitation",
      message: `You've been invited to join a section`,
    });

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateMemberRoleAction(
  sectionId: string,
  userId: string,
  role: SectionRole
) {
  const session = await requireSession();

  const validation = validate(updateMemberRoleSchema, { sectionId, userId, role });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if user has permission (must be owner)
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || memberRole.role !== "OWNER") {
      return { error: "Only section owners can change roles" };
    }

    await updateMemberRole(sectionId, userId, role);

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function removeMemberAction(sectionId: string, userId: string) {
  const session = await requireSession();

  const validation = validate(removeMemberSchema, { sectionId, userId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    // Check if user has permission (must be owner or moderator)
    const memberRole = await getMemberRole(sectionId, session.user.id);
    if (!memberRole || !["OWNER", "MODERATOR"].includes(memberRole.role)) {
      return { error: "Insufficient permissions" };
    }

    await removeMember(sectionId, userId);

    // Update member count
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        memberCount: {
          decrement: 1,
        },
      },
    });

    revalidatePath("/dashboard/threads");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getSectionMembersAction(sectionId: string) {
  const validation = validate(getSectionMembersSchema, { sectionId });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const members = await getSectionMembers(sectionId);
    return { success: true, data: members };
  } catch (error) {
    return handleError(error);
  }
}

