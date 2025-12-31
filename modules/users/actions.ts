"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import { updateUserProfileSchema, updateProfilePrivacySchema } from "./schemas";
import { FILE_LIMITS } from "@/lib/config/constants";
import {
  getPublicProfile,
  getUserThreads,
  updateProfilePrivacy,
} from "./repository";
import { ProfilePrivacy } from "@prisma/client";

export async function updateUserProfile(formData: FormData) {
  const session = await requireSession();

  const data = {
    name: formData.get("name") as string,
    bio: formData.get("bio") as string,
    location: formData.get("location") as string,
    website: formData.get("website") as string,
    twitter: formData.get("twitter") as string,
    github: formData.get("github") as string,
    linkedin: formData.get("linkedin") as string,
  };

  const validation = validate(updateUserProfileSchema, data);
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: validation.data.name || null,
        bio: validation.data.bio || null,
        location: validation.data.location || null,
        website: validation.data.website || null,
        twitter: validation.data.twitter || null,
        github: validation.data.github || null,
        linkedin: validation.data.linkedin || null,
      },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/profile");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function uploadAvatar(formData: FormData) {
  const session = await requireSession();
  const file = formData.get("avatar") as File;

  if (!file) {
    return { error: "No file provided" };
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
    };
  }

  // Validate file size
  if (file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
    return { error: "File size must be less than 4.5MB" };
  }

  try {
    const blob = await put(
      `avatars/${session.user.id}-${Date.now()}.${file.name.split(".").pop()}`,
      file,
      {
        access: "public",
      }
    );

    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: blob.url },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/profile");
    return { success: true, url: blob.url };
  } catch (error) {
    return handleError(error);
  }
}

export async function uploadBanner(formData: FormData) {
  const session = await requireSession();
  const file = formData.get("banner") as File;

  if (!file) {
    return { error: "No file provided" };
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
    };
  }

  // Validate file size
  if (file.size > FILE_LIMITS.MAX_IMAGE_SIZE) {
    return { error: "File size must be less than 4.5MB" };
  }

  try {
    const blob = await put(
      `banners/${session.user.id}-${Date.now()}.${file.name.split(".").pop()}`,
      file,
      {
        access: "public",
      }
    );

    await prisma.user.update({
      where: { id: session.user.id },
      data: { bannerUrl: blob.url },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/profile");
    return { success: true, url: blob.url };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUserProfile(userId: string) {
  const session = await requireSession();

  try {
    const profile = await getPublicProfile(userId, session.user.id);

    if (!profile) {
      return { error: "Profile not found or not accessible" };
    }

    return { success: true, data: profile };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUserThreadsAction(
  userId: string,
  limit?: number,
  offset?: number
) {
  try {
    const result = await getUserThreads(userId, limit || 20, offset || 0);
    return { success: true, data: result };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateProfilePrivacyAction(privacy: string) {
  const session = await requireSession();

  const validation = validate(updateProfilePrivacySchema, { privacy });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await updateProfilePrivacy(
      session.user.id,
      validation.data.privacy as ProfilePrivacy
    );
    revalidatePath("/dashboard/settings");
    revalidatePath(`/user/${session.user.id}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
