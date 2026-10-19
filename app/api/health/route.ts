import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/infrastructure/logger";
import { prisma } from "@/lib/infrastructure/prisma";
import { Redis } from "@upstash/redis";
import { fail, HTTP_STATUS } from "@/lib/utils/api-response";
import { rateLimit } from "@/lib/services/rate-limit";
import { getRequestIp } from "@/lib/utils/request-ip";

type ServiceStatus = "ok" | "not_configured" | "error";

const HEALTH_CHECK_TIMEOUT_MS = 750;
const HEALTHY_CACHE_CONTROL = "public, max-age=10, stale-while-revalidate=30";
const UNHEALTHY_CACHE_CONTROL = "no-store, max-age=0";

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
    let aiKey: string | undefined;
    if (env.AI_PROVIDER === "gemini") {
      aiKey = env.GEMINI_API_KEY;
    } else {
      aiKey = env.OPENAI_API_KEY;
    }
    if (aiKey) {
      return "ok";
    }
    return "not_configured";
  } catch (err) {
    logger.error("[health] ai config check failed", err);
    return "error";
  }
}

export async function GET(request: NextRequest) {
  // Public path (proxy skips it), so the edge limiter never runs — bound the
  // DB/Redis probes here instead.
  const ip = getRequestIp(request);
  const rateLimitResult = await rateLimit({ key: `health:${ip}`, type: "api" });
  if (!rateLimitResult.success) {
    return NextResponse.json(fail("RATE_LIMITED", "Too many requests"), { status: HTTP_STATUS.RATE_LIMITED });
  }

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
    status: allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE,
    headers: {
      // Healthy probes are cacheable so CDN hits don't re-probe DB/Redis;
      // degraded responses must never be cached.
      "Cache-Control": allHealthy ? HEALTHY_CACHE_CONTROL : UNHEALTHY_CACHE_CONTROL,
    },
  });
}
