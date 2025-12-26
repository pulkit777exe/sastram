"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { handleError } from "@/lib/utils/errors";
import {
  subscribeToThreadNewsletter,
  scheduleThreadDigest,
} from "./repository";

export async function unsubscribeFromThread(threadId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.newsletterSubscription.deleteMany({
      where: {
        threadId,
        userId: session.user.id,
      },
    });

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUserNewsletterSubscriptions() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return [];
  }

  try {
    const subscriptions = await prisma.newsletterSubscription.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        thread: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return subscriptions;
  } catch (error) {
    console.error("Failed to fetch subscriptions:", error);
    return [];
  }
}

export async function subscribeToThreadAction({
  threadId,
  slug,
}: {
  threadId: string;
  slug: string;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in to subscribe");
  }

  const email = session.user.email;
  await subscribeToThreadNewsletter({
    threadId,
    userId: session.user.id,
    email,
  });

  await scheduleThreadDigest(threadId);
  revalidatePath(`/dashboard/threads/thread/${slug}`);
}
