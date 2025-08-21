import { NextResponse } from "next/server";
import { buildDailyDigest, saveDailyDigest, getLatestDigest } from "@/lib/db";
import type { DigestItem } from "@/lib/db/schema";

// Simple AI summary function (you can replace this with OpenAI, Anthropic, etc.)
async function generateAISummary(items: DigestItem[]) {
  if (items.length === 0) return "No new posts today.";
  
  const categories = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<DigestItem["category"], number>);
  
  const summary = `Today's digest contains ${items.length} posts across ${Object.keys(categories).length} categories. `;
  const categoryDetails = Object.entries(categories)
    .map(([cat, count]) => `${count} ${cat} posts`)
    .join(", ");
  
  return summary + categoryDetails + ". Notable highlights include job postings in technology and game launches in gaming.";
}

export async function POST() {
  try {
    const digest = await buildDailyDigest();
    const aiSummary = await generateAISummary(digest.items);
    const saved = await saveDailyDigest(digest, aiSummary);
    
    return NextResponse.json({ 
      digest: { ...digest, aiSummary, id: saved.id },
      message: "Daily digest processed and saved with AI summary"
    });
  } catch (error) {
    console.error("Error processing digest:", error);
    return NextResponse.json({ error: "Failed to process digest" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const latest = await getLatestDigest();
    if (!latest) {
      const digest = await buildDailyDigest();
      return NextResponse.json({ digest });
    }
    
    return NextResponse.json({ digest: latest });
  } catch (error) {
    console.error("Error fetching digest:", error);
    return NextResponse.json({ error: "Failed to fetch digest" }, { status: 500 });
  }
} 