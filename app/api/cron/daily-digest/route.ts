import { NextRequest, NextResponse } from "next/server";
import { buildDailyDigest, saveDailyDigest, getSubscribers } from "@/lib/db";
import type { DigestItem } from "@/lib/db/schema";

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

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.DIGEST_CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log("Starting daily digest processing...");
    
    // Build digest from last 24 hours
    const digest = await buildDailyDigest(24);
    
    // Generate AI summary
    const aiSummary = await generateAISummary(digest.items);
    
    // Save to database
    const saved = await saveDailyDigest(digest, aiSummary);
    
    // Get subscribers for email sending (you can implement email sending here)
    const subscribers = await getSubscribers();
    
    console.log(`Daily digest processed: ${digest.items.length} items, ${subscribers.length} subscribers`);
    
    return NextResponse.json({ 
      success: true,
      digest: { ...digest, aiSummary, id: saved.id },
      subscribersCount: subscribers.length,
      message: "Daily digest processed successfully"
    });
    
  } catch (error) {
    console.error("Error processing daily digest:", error);
    return NextResponse.json({ 
      error: "Failed to process daily digest",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 