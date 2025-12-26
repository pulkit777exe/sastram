"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/services/auth";
import { headers } from "next/headers";
import { aiService } from "@/lib/services/ai";
import { logger } from "@/lib/infrastructure/logger";
import { prisma } from "@/lib/infrastructure/prisma";
import {
  completeDigest,
  getDueDigests,
  getThreadTranscript,
  listThreadSubscribers,
  markDigestProcessing,
  scheduleThreadDigest,
  subscribeToThreadNewsletter,
} from "./repository";

export async function subscribeToThread({ threadId, slug }: { threadId: string; slug: string }) {
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

export async function processPendingDigests() {
  const digests = await getDueDigests();
  for (const digest of digests) {
    await markDigestProcessing(digest.id);
    const transcript = await getThreadTranscript(digest.threadId);
    const content = transcript
      .map(
        (message) =>
          `${message.sender?.name || message.sender?.email || "Anonymous"}: ${message.content}`,
      )
      .join("\n");

    const summary = await aiService.generateSummary(content);
    const subscribers = await listThreadSubscribers(digest.threadId);

    // Get thread info for email
    const thread = await prisma.section.findUnique({
      where: { id: digest.threadId },
      select: { name: true, slug: true },
    });

    if (!thread) {
      logger.error(`Thread ${digest.threadId} not found for digest`);
      await completeDigest(digest.id, summary, 0);
      continue;
    }

    const threadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/thread/${thread.slug}`;

    // Send emails via Resend
    const { sendNewsletterDigest } = await import("@/lib/services/email");
    let emailCount = 0;

    for (const subscriber of subscribers) {
      try {
        await sendNewsletterDigest(
          subscriber.email,
          thread.name,
          summary,
          threadUrl
        );
        emailCount++;
      } catch (error) {
        logger.error(`Failed to send digest email to ${subscriber.email}:`, error);
      }
    }

    await completeDigest(digest.id, summary, emailCount);
  }
}

