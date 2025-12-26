"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import { validate } from "@/lib/utils/validation";
import { handleError } from "@/lib/utils/errors";
import {
  createPoll as createPollRepo,
  voteOnPoll as voteOnPollRepo,
  getPollResults as getPollResultsRepo,
  getUserVote as getUserVoteRepo,
  getPollByThreadId as getPollByThreadIdRepo,
} from "./repository";
import { createPollSchema, voteOnPollSchema } from "./schemas";

export async function createPollAction(
  threadId: string,
  question: string,
  options: string[],
  expiresAt?: Date
) {
  const session = await requireSession();

  const validation = validate(createPollSchema, {
    threadId,
    question,
    options,
    expiresAt,
  });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    const poll = await createPollRepo(
      validation.data.threadId,
      validation.data.question,
      validation.data.options,
      validation.data.expiresAt
    );

    revalidatePath(`/dashboard/threads/thread/${threadId}`);
    return { success: true, data: poll };
  } catch (error) {
    return handleError(error);
  }
}

export async function voteOnPollAction(pollId: string, optionIndex: number) {
  const session = await requireSession();

  const validation = validate(voteOnPollSchema, { pollId, optionIndex });
  if (!validation.success) {
    return { error: validation.error };
  }

  try {
    await voteOnPollRepo(validation.data.pollId, session.user.id, validation.data.optionIndex);

    // Get thread ID from poll to revalidate
    const poll = await getPollByThreadIdRepo(pollId);
    if (poll) {
      revalidatePath(`/dashboard/threads/thread/${poll.threadId}`);
    }

    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function getPollResultsAction(pollId: string) {
  try {
    const results = await getPollResultsRepo(pollId);
    if (!results) {
      return { error: "Poll not found" };
    }
    return { success: true, data: results };
  } catch (error) {
    return handleError(error);
  }
}

export async function getUserVoteAction(pollId: string) {
  const session = await requireSession();

  try {
    const vote = await getUserVoteRepo(pollId, session.user.id);
    return { success: true, data: vote };
  } catch (error) {
    return handleError(error);
  }
}

export async function getPollByThreadAction(threadId: string) {
  try {
    const poll = await getPollByThreadIdRepo(threadId);
    return { success: true, data: poll };
  } catch (error) {
    return handleError(error);
  }
}

