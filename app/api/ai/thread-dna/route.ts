import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/modules/auth/session";
import { prisma } from "@/lib/infrastructure/prisma";
import { aiService } from "@/lib/services/ai";
import { z } from "zod";

const dnaRequestSchema = z.object({
  threadId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId } = dnaRequestSchema.parse(body);

    // Fetch thread and messages
    const thread = await prisma.section.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: parseInt(process.env.AI_ANALYSIS_MESSAGE_LIMIT || "50", 10), // Limit to configured number of messages for DNA analysis
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
      return NextResponse.json({ dna: {
        questionType: "other",
        expertiseLevel: "intermediate",
        topics: ["general discussion"],
        readTimeMinutes: 1,
      } });
    }

    // Generate thread DNA
    const threadDNA = await aiService.generateThreadDNA(messages);

    // Update thread with new DNA
    await prisma.section.update({
      where: { id: threadId },
      data: { threadDna: threadDNA },
    });

    return NextResponse.json({ dna: threadDNA });
  } catch (error) {
    console.error("Error generating thread DNA:", error);
    return NextResponse.json(
      { error: "Failed to generate thread DNA" },
      { status: 500 },
    );
  }
}
