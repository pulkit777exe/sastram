import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/infrastructure/logger";

type ServiceStatus = "ok" | "not_configured" | "error";

const HEALTH_CHECK_TIMEOUT_MS = 750;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} health check timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkDatabase(): Promise<ServiceStatus> {
  try {
    const { prisma } = await import("@/lib/infrastructure/prisma");
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS, "database");
    return "ok";
  } catch (err) {
    logger.error("[health] database check failed", err);
    return "error";
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return "not_configured";
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();
    await withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT_MS, "redis");
    return "ok";
  } catch (err) {
    logger.error("[health] redis check failed", err);
    return "error";
  }
}

function checkAi(): ServiceStatus {
  try {
    const aiKey =
      env.AI_PROVIDER === "gemini"
        ? env.GEMINI_API_KEY
        : env.OPENAI_API_KEY;
    return aiKey ? "ok" : "not_configured";
  } catch (err) {
    logger.error("[health] ai config check failed", err);
    return "error";
  }
}

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

  const [database, redis, ai] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkAi()),
  ]);

  checks.services.database = database;
  checks.services.redis = redis;
  checks.services.ai = ai;

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
