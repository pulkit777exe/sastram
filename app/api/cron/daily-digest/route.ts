import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/infrastructure/prisma";
import { aiService } from "@/lib/services/ai";
import { sendEmail } from "@/lib/services/email";
import { startOfDay, endOfDay } from "date-fns";

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
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    // 1. Get all active subscriptions
    const subscriptions = await prisma.newsletterSubscription.findMany({
      where: {
        isActive: true,
        frequency: "DAILY", // Currently we only support daily
      },
      include: {
        thread: {
          include: {
            messages: {
              where: {
                createdAt: {
                  gte: start,
                  lte: end,
                },
              },
              include: { sender: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Group subscriptions by thread to avoid re-generating summary for same thread
    // formatting: Map<ThreadID, { messages: Message[], summary: Promise<string> | string }>
    const threadSummaries = new Map();

    for (const sub of subscriptions) {
      const thread = sub.thread;
      const messages = thread.messages;

      if (messages.length === 0) {
        results.skipped++;
        continue;
      }

      // Generate or retrieve summary for this thread
      let summaryHtml = "";
      try {
        if (!threadSummaries.has(thread.id)) {
          // Store the promise immediately to handle concurrent processing if we parallelize
          // For now it's sequential but good practice
          const summaryPromise = aiService.generateDailyDigest(messages);
          threadSummaries.set(thread.id, summaryPromise);
        }

        summaryHtml = await threadSummaries.get(thread.id);
      } catch (err) {
        console.error(
          `Failed to generate summary for thread ${thread.id}:`,
          err,
        );
        results.errors++;
        continue;
      }

      // Send Email
      try {
        await sendEmail({
          to: sub.email,
          subject: `Daily Digest: ${thread.name}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Daily Digest for ${thread.name}</h2>
              <div style="background-color: #f4f4f5; padding: 20px; border-radius: 8px;">
                ${summaryHtml}
              </div>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">
                You are receiving this because you subscribed to this thread.
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/threads/thread/${thread.slug}">View Thread</a>
              </p>
            </div>
          `,
        });
        results.sent++;
      } catch (err) {
        console.error(`Failed to send email to ${sub.email}:`, err);
        results.errors++;
      }
      results.processed++;
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Daily digest cron error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
