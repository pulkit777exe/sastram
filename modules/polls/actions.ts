"use server";

import { requireSession } from "@/modules/auth/session";
import { revalidatePath } from "next/cache";
import {
  createPoll as createPollRepo,
  voteOnPoll as voteOnPollRepo,
  closePoll as closePollRepo,
  getPollResults as getPollResultsRepo,
  getUserVote as getUserVoteRepo,
  getPollById as getPollByIdRepo,
  getPollByThreadId as getPollByThreadIdRepo,
} from "./repository";
import { createPollSchema, voteOnPollSchema } from "./schemas";
import { z } from "zod";
import { getMemberRole } from "@/modules/members/repository";

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
    const poll = await getPollByIdRepo(parsed.data.pollId);
    if (!poll) {
      return { data: null, error: "Poll not found" };
    }

    if (!poll.isActive) {
      return { data: null, error: "Voting is closed for this poll" };
    }

    if (poll.expiresAt && poll.expiresAt.getTime() < Date.now()) {
      return { data: null, error: "Voting is closed for this poll" };
    }

    const existingVote = await getUserVoteRepo(parsed.data.pollId, session.user.id);
    if (existingVote) {
      return { data: null, error: "You have already voted on this poll" };
    }

    await voteOnPollRepo(
      parsed.data.pollId,
      session.user.id,
      parsed.data.optionIndex,
    );

    if (poll.thread?.slug) {
      revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
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

export async function closePollAction(pollId: string) {
  const parsed = pollIdSchema.safeParse({ pollId });
  if (!parsed.success) {
    return { data: null, error: "Invalid input" };
  }

  try {
    const session = await requireSession();
    const poll = await getPollByIdRepo(parsed.data.pollId);
    if (!poll) {
      return { data: null, error: "Poll not found" };
    }

    let canClose = poll.thread?.createdBy === session.user.id;
    if (!canClose && poll.threadId) {
      const memberRole = await getMemberRole(poll.threadId, session.user.id);
      canClose = !!memberRole && ["OWNER", "MODERATOR"].includes(memberRole.role);
    }

    if (!canClose) {
      return { data: null, error: "Insufficient permissions" };
    }

    await closePollRepo(parsed.data.pollId);

    if (poll.thread?.slug) {
      revalidatePath(`/dashboard/threads/thread/${poll.thread.slug}`);
    }

    return { data: null, error: null };
  } catch (error) {
    console.error("[closePollAction]", error);
    return { data: null, error: "Something went wrong" };
  }
}
