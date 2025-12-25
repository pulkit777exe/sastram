"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { aiService } from "@/lib/ai";
import { logger } from "@/lib/logger";
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

    // TODO: Replace with transactional email provider.
    subscribers.forEach((subscriber) => {
      logger.info(
        `Sending digest for thread ${digest.threadId} to ${subscriber.email}: ${summary}`,
      );
    });

    await completeDigest(digest.id, summary, subscribers.length);
  }
}

