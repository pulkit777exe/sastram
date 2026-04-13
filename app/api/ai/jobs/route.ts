import { NextRequest, NextResponse } from "next/server";
import { getAiPipelineQueues } from "@/lib/infrastructure/bullmq";
import { requireSession } from "@/modules/auth/session";
import type { Job } from "bullmq";

async function findJob(jobId: string): Promise<{ job: Job; queueName: string } | null> {
  const queues = getAiPipelineQueues();

  for (const queue of queues) {
    const job = await queue.getJob(jobId);
    if (job) {
      return { job, queueName: queue.name };
    }
  }

  return null;
}

// Get job status
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId query parameter is required" },
        { status: 400 },
      );
    }

    const result = await findJob(jobId);
    const job = result?.job;

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 },
      );
    }

    // Check if user has access to the job
    const jobDataPayload = job.data as { userId?: string };
    if (jobDataPayload.userId && jobDataPayload.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized to access this job" },
        { status: 403 },
      );
    }

    const jobState = await job.getState();
    const jobData: any = {
      id: job.id,
      name: job.name,
      state: jobState,
      queue: result?.queueName,
      createdAt: job.timestamp,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    };

    if (jobState === "completed") {
      const jobResult = await job.returnvalue;
      jobData.result = jobResult;
    } else if (jobState === "failed") {
      const jobError = await job.failedReason;
      jobData.error = jobError;
    }

    return NextResponse.json(jobData);
  } catch (error) {
    console.error("Error getting job status:", error);
    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 },
    );
  }
}

// Cancel a job
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId query parameter is required" },
        { status: 400 },
      );
    }

    const result = await findJob(jobId);
    const job = result?.job;

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 },
      );
    }

    await job.remove();

    return NextResponse.json({ success: true, message: "Job cancelled" });
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 },
    );
  }
}
