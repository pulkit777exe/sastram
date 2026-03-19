import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/modules/auth/session";
import { prisma } from "@/lib/infrastructure/prisma";
import {
  AIJobType,
  DEFAULT_JOB_OPTIONS,
  getThreadSummaryQueue,
} from "@/lib/infrastructure/bullmq";
import { z } from "zod";

const summaryRequestSchema = z.object({
  threadId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId } = summaryRequestSchema.parse(body);

    // Fetch thread and messages
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: 50, // Limit to last 50 messages for summary context
          orderBy: { createdAt: "desc" },
          include: { sender: true },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Reverse to chronological order for AI
    const messages = thread.messages.reverse();

    if (messages.length === 0) {
      return NextResponse.json({ summary: "No messages to summarize yet." });
    }

    // Add job to AI queue
    const threadSummaryQueue = getThreadSummaryQueue();
    const job = await threadSummaryQueue.add(
      AIJobType.GENERATE_THREAD_SUMMARY,
      { threadId, messages, userId: session.user.id },
      {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `generate-summary-${threadId}`,
      },
    );

    return NextResponse.json({ 
      jobId: job.id, 
      status: "pending",
      message: "Summary generation started" 
    });
  } catch (error) {
    console.error("Error generating thread summary:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
