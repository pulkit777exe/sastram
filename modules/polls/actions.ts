"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import {
  createPoll as createPollRepo,
  voteOnPoll as voteOnPollRepo,
  getPollResults as getPollResultsRepo,
  getUserVote as getUserVoteRepo,
  getPollByThreadId as getPollByThreadIdRepo,
} from "./repository";
import { createPollSchema, voteOnPollSchema } from "./schemas";
import { z } from "zod";

const pollIdSchema = z.object({
  pollId: z.string().cuid(),
});

const threadIdSchema = z.object({
  threadId: z.string().cuid(),
});

export async function createPollAction(
  threadId: string,
  question: string,
  options: string[],
  expiresAt?: Date,
) {
  const parsed = createPollSchema.safeParse({
    threadId,
    question,
    options,
    expiresAt,
  });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const poll = await createPollRepo(
      parsed.data.threadId,
      parsed.data.question,
      parsed.data.options,
      parsed.data.expiresAt,
    );

    revalidatePath(`/dashboard/threads/thread/${parsed.data.threadId}`);
    return { data: poll, error: null };
  } catch (error) {
    console.error("[createPollAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function voteOnPollAction(pollId: string, optionIndex: number) {
  const parsed = voteOnPollSchema.safeParse({ pollId, optionIndex });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    await voteOnPollRepo(
      parsed.data.pollId,
      session.user.id,
      parsed.data.optionIndex,
    );

    // Get thread ID from poll to revalidate
    const poll = await getPollByThreadIdRepo(parsed.data.pollId);
    if (poll) {
      revalidatePath(`/dashboard/threads/thread/${poll.threadId}`);
    }

    return { data: null, error: null };
  } catch (error) {
    console.error("[voteOnPollAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getPollResultsAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const results = await getPollResultsRepo(parsed.data.pollId);
    if (!results) {
      return { data: null, error: "Something went wrong" };
    }
    return { data: results, error: null };
  } catch (error) {
    console.error("[getPollResultsAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getUserVoteAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const vote = await getUserVoteRepo(parsed.data.pollId, session.user.id);
    return { data: vote, error: null };
  } catch (error) {
    console.error("[getUserVoteAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}

export async function getPollByThreadAction(threadId: string) {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const poll = await getPollByThreadIdRepo(parsed.data.threadId);
    return { data: poll, error: null };
  } catch (error) {
    console.error("[getPollByThreadAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
