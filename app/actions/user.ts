"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { userProfileSchema } from "@/lib/security";

export async function updateUserProfile(formData: FormData) {
  const name = formData.get("name") as string;

  const validation = userProfileSchema.safeParse({ name });
  
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: validation.data.name,
      },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/profile");
    return { success: true };
  } catch (error) {
    console.error("Failed to update profile:", error);
    return { error: "Failed to update profile" };
  }
}

