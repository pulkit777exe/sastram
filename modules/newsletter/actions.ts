"use server";

import { subscribeToThread, processPendingDigests } from "./service";

export async function subscribeToThreadAction(input: { threadId: string; slug: string }) {
  await subscribeToThread(input);
}

export async function processDigestsAction() {
  await processPendingDigests();
}

