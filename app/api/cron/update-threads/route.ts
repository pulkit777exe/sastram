import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { aiService } from "@/lib/services/ai";

export async function GET(req: NextRequest) {
  // Verify Cron Secret (optional but recommended for production)
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all active threads
    const threads = await prisma.section.findMany({
      where: {
        // Only process threads that have been active in the last 30 days
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        messages: {
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || "50", 10),
          orderBy: { createdAt: "desc" },
          include: { sender: true },
        },
      },
    });

    const results = {
      processed: 0,
      updatedDNA: 0,
      updatedScore: 0,
      markedOutdated: 0,
      errors: 0,
    };

  // Process threads with controlled concurrency using a promise pool
  async function processWithConcurrency(
    items: any[],
    concurrency: number,
    processor: (item: any) => Promise<void>,
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const activePromises: Promise<void>[] = [];

    for (const item of items) {
      const promise = processor(item).finally(() => {
        const index = activePromises.indexOf(promise);
        if (index > -1) {
          activePromises.splice(index, 1);
        }
      });

      activePromises.push(promise);
      promises.push(promise);

      if (activePromises.length >= concurrency) {
        await Promise.race(activePromises);
      }
    }

    await Promise.all(promises);
  }

  const concurrencyLimit = parseInt(process.env.CRON_CONCURRENCY_LIMIT || "5", 10);
  const processThread = async (thread: any) => {
    try {
      results.processed++;

      // Skip threads with no messages
      if (thread.messages.length === 0) {
        return;
      }

      // Reverse to chronological order for AI
      const messages = thread.messages.reverse();

      // Update thread DNA
      const threadDNA = await aiService.generateThreadDNA(messages);
      await prisma.section.update({
        where: { id: thread.id },
        data: { threadDna: threadDNA },
      });
      results.updatedDNA++;

      // Update resolution score
      const score = await aiService.calculateResolutionScore(messages);
      await prisma.section.update({
        where: { id: thread.id },
        data: { resolutionScore: score },
      });
      results.updatedScore++;

      // Check staleness (simple heuristic for now)
      const isOutdated = thread.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (isOutdated) {
        await prisma.section.update({
          where: { id: thread.id },
          data: { isOutdated, lastVerifiedAt: new Date() },
        });
        results.markedOutdated++;
      }
    } catch (error) {
      console.error(`Failed to process thread ${thread.id}:`, error);
      results.errors++;
    }
  };

  // Process threads with controlled concurrency
  await processWithConcurrency(threads, concurrencyLimit, processThread);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Update threads cron error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
