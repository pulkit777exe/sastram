import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/infrastructure/logger";

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
  } catch (err) {
    logger.error("[health] database check failed", err);
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
  } catch (err) {
    logger.error("[health] redis check failed", err);
    checks.services.redis = "error";
  }

  try {
    const aiKey =
      env.AI_PROVIDER === "gemini"
        ? env.GEMINI_API_KEY
        : env.OPENAI_API_KEY;
    checks.services.ai = aiKey ? "configured" : "not_configured";
  } catch (err) {
    logger.error("[health] ai config check failed", err);
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
