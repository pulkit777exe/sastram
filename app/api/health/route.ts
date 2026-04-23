import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";

export async function GET() {
  const checks = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
    uptime: process.uptime(),
    services: {
      database: "unknown",
      redis: "unknown",
      ai: "unknown",
    },
  };

  try {
    const { prisma } = await import("@/lib/infrastructure/prisma");
    await prisma.$queryRaw`SELECT 1`;
    checks.services.database = "ok";
  } catch {
    checks.services.database = "error";
  }

  try {
    const { Redis } = await import("@upstash/redis");
    if (process.env.UPSTASH_REDIS_REST_URL) {
      const redis = Redis.fromEnv();
      await redis.ping();
      checks.services.redis = "ok";
    } else {
      checks.services.redis = "not_configured";
    }
  } catch {
    checks.services.redis = "error";
  }

  try {
    const aiKey =
      process.env.AI_PROVIDER === "gemini"
        ? process.env.GEMINI_API_KEY
        : process.env.OPENAI_API_KEY;
    checks.services.ai = aiKey ? "configured" : "not_configured";
  } catch {
    checks.services.ai = "error";
  }

  const allHealthy = Object.values(checks.services).every(
    (s) => s === "ok" || s === "not_configured"
  );

  return NextResponse.json(checks, {
    status: allHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}