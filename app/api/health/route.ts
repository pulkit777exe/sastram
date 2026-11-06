import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/infrastructure/logger";
import { prisma } from "@/lib/infrastructure/prisma";
import { getUpstashRedis } from "@/lib/infrastructure/redis-upstash";
import { fail, HTTP_STATUS } from "@/lib/utils/api-response";
import { InMemoryRateLimiter } from "@/lib/services/rate-limit";
import { getRequestIp } from "@/lib/utils/request-ip";
import { APP_VERSION } from "@/lib/config/app-version";

// Per-instance limiter for probes: a load balancer's health check must not
// consume shared Redis budget (one Redis op per probe). 120 req/min/IP is
// far above any sane probe cadence.
const healthProbeLimiter = new InMemoryRateLimiter(120, 60);

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
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS, "database");
    return "ok";
  } catch (err) {
    logger.error("[health] database check failed", err);
    return "error";
  }
}

// Probe cadence can be every few seconds; each PING is a billed Upstash command.
// A short per-instance cache keeps readiness meaningful without spending the
// free-tier budget on health checks alone. Failures are re-probed sooner.
const REDIS_PING_OK_TTL_MS = 60_000;
const REDIS_PING_ERROR_TTL_MS = 10_000;
let redisPingCache: { status: ServiceStatus; expiresAt: number } | null = null;

async function checkRedis(): Promise<ServiceStatus> {
  const now = Date.now();
  if (redisPingCache && redisPingCache.expiresAt > now) {
    return redisPingCache.status;
  }

  let status: ServiceStatus;
  const redis = getUpstashRedis();
  if (!redis) {
    // Shared rate limits, quotas, and AI spend caps fail closed without Redis.
    // That is tolerable locally, but a production instance is not safe to
    // route traffic to, so surface it as degraded.
    status = env.NODE_ENV === "production" ? "error" : "not_configured";
  } else {
    try {
      await withTimeout(redis.ping(), HEALTH_CHECK_TIMEOUT_MS, "redis");
      status = "ok";
    } catch (err) {
      logger.error("[health] redis check failed", err);
      status = "error";
    }
  }

  redisPingCache = {
    status,
    expiresAt: now + (status === "ok" ? REDIS_PING_OK_TTL_MS : REDIS_PING_ERROR_TTL_MS),
  };
  return status;
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
    // Production defaults to content moderation on. Without the matching
    // provider key the text classifier would silently skip ML moderation, so
    // do not let a load balancer route traffic to this instance. Operators
    // who intentionally run regex-only moderation must opt out explicitly.
    if (env.NODE_ENV === "production" && env.CONTENT_MODERATION_ENABLED) {
      logger.error("[health] content moderation is enabled but no AI provider key is configured");
      return "error";
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
  const rateLimitResult = await healthProbeLimiter.check(ip);
  if (!rateLimitResult.success) {
    return NextResponse.json(fail("RATE_LIMITED", "Too many requests"), { status: HTTP_STATUS.RATE_LIMITED });
  }

  const checks = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
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
  checks.status = allHealthy ? "ok" : "degraded";

  return NextResponse.json(checks, {
    status: allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE,
    headers: {
      // A load balancer must never act on a cached "ready" after the database
      // goes away, so readiness is always uncached.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
