"use server";

import { prisma } from "@/lib/infrastructure/prisma";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  subscribeToThreadNewsletter,
  scheduleThreadDigest,
} from "./repository";
import { z } from "zod";

const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

const subscribeSchema = z.object({
  threadId: z.string().cuid(),
  slug: z.string().min(1),
});

const updateSubscriptionFrequencySchema = z.object({
  threadId: z.string().cuid(),
  frequency: z.enum(["DAILY", "WEEKLY", "NEVER"]),
});

export async function unsubscribeFromThread(threadId: string) {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: "Something went wrong" };
    }

    await prisma.threadSubscription.deleteMany({
      where: {
        threadId: parsed.data.threadId,
        userId: session.user.id,
      },
    });

    revalidatePath("/dashboard/settings");
    return { data: null, error: null };
  } catch (error) {
    console.error("[unsubscribeFromThread]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function updateSubscriptionFrequencyAction({
  threadId,
  frequency,
}: {
  threadId: string;
  frequency: string;
}) {
  const parsed = updateSubscriptionFrequencySchema.safeParse({
    threadId,
    frequency,
  });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: "Something went wrong" };
    }

    await prisma.threadSubscription.update({
      where: {
        threadId_userId: {
          threadId: parsed.data.threadId,
          userId: session.user.id,
        },
      },
      data: {
        frequency: parsed.data.frequency,
      },
    });

    return { data: null, error: null };
  } catch (error) {
    console.error("[updateSubscriptionFrequencyAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getUserNewsletterSubscriptions() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: [], error: null };
    }

    const subscriptions = await prisma.threadSubscription.findMany({
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

    return { data: subscriptions, error: null };
  } catch (error) {
    console.error("[getUserNewsletterSubscriptions]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function subscribeToThreadAction({
  threadId,
  slug,
}: {
  threadId: string;
  slug: string;
}) {
  const parsed = subscribeSchema.safeParse({ threadId, slug });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { data: null, error: "Something went wrong" };
    }

    const email = session.user.email;
    await subscribeToThreadNewsletter({
      threadId: parsed.data.threadId,
      userId: session.user.id,
      email,
    });

    await scheduleThreadDigest(parsed.data.threadId);
    revalidatePath(`/dashboard/threads/thread/${parsed.data.slug}`);
    return { data: null, error: null };
  } catch (error) {
    console.error("[subscribeToThreadAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
