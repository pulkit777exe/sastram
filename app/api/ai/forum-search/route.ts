import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeSearchQuery, validateApiKeys } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { executeAISearch } from "@/modules/ai-search/service";
import {
  getCachedResult,
  cacheResult,
} from "@/modules/ai-search/cache";

export const maxDuration = 30;

const searchRequestSchema = z.object({
  query: z
    .string()
    .min(3, "Query must be at least 3 characters")
    .max(500, "Query must be at most 500 characters")
    .transform(sanitizeSearchQuery),
  config: z.object({
    exaMode: z.enum(["agentic", "instant", "websets"]),
    tavilyMode: z.enum(["search", "extract", "crawl", "research"]),
    sourceFilter: z.enum(["all", "technical", "reddit-hn", "docs"]),
    searchMode: z.enum(["standard", "instant", "table"]),
  }),
  sessionId: z.string().uuid().optional(),
});

function errorResponse(
  message: string,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export async function POST(request: NextRequest) {
  try {
    // 1. Content-Type check
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return errorResponse("Content-Type must be application/json", 415);
    }

    // 2. Rate limiting by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResult = await rateLimit(ip);
    if (!rateLimitResult.success) {
      const retryAfter = String(
        Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
      );
      return errorResponse("Too many requests. Please try again later.", 429, {
        "Retry-After": retryAfter,
      });
    }

    // 3. Extract and validate API keys from headers
    const exaKey =
      request.headers.get("x-exa-key") || process.env.SASTRAM_EXA_KEY || "";
    const tavilyKey =
      request.headers.get("x-tavily-key") ||
      process.env.SASTRAM_TAVILY_KEY ||
      "";
    const geminiKey =
      request.headers.get("x-gemini-key") ||
      process.env.SASTRAM_GEMINI_KEY ||
      "";

    if (!exaKey || !tavilyKey || !geminiKey) {
      const missing = [];
      if (!exaKey) missing.push("Exa");
      if (!tavilyKey) missing.push("Tavily");
      if (!geminiKey) missing.push("Gemini");
      return errorResponse(
        `Missing API key${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Configure in API Keys settings.`,
        400,
      );
    }

    const keyValidation = validateApiKeys({
      exa: exaKey,
      tavily: tavilyKey,
      gemini: geminiKey,
    });
    if (!keyValidation.allValid) {
      const invalid = [];
      if (!keyValidation.exaValid) invalid.push("Exa");
      if (!keyValidation.tavilyValid) invalid.push("Tavily");
      if (!keyValidation.geminiValid) invalid.push("Gemini");
      return errorResponse(
        `Invalid API key format for: ${invalid.join(", ")}. Please check your keys.`,
        400,
      );
    }

    // 4. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON in request body", 400);
    }

    const validation = searchRequestSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return errorResponse(
        firstError?.message || "Invalid request parameters",
        400,
      );
    }

    const { query, config } = validation.data;

    // Edge case: query is empty after sanitization
    if (!query || query.length < 3) {
      return errorResponse(
        "Query is too short after sanitization. Please try a different search.",
        400,
      );
    }

    // 5. Check cache
    try {
      const cached = await getCachedResult(query);
      if (cached) {

        return NextResponse.json(cached, {
          headers: {
            "Cache-Control": "no-store",
            "X-Cache": "HIT",
          },
        });
      }
    } catch {
      // Cache miss is non-critical, continue
    }

    // 6. Execute the search pipeline
    const result = await executeAISearch(query, config, {
      exa: exaKey,
      tavily: tavilyKey,
      gemini: geminiKey,
    });

    // 7. Validate result shape
    if (!result.synthesis || !Array.isArray(result.sources)) {
      return errorResponse(
        "Search produced an unexpected result. Please try again.",
        500,
      );
    }

    // 8. Cache the result (async, non-blocking)
    cacheResult(query, result, result.synthesis.queryType).catch(() => {});



    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    // Log without exposing internals
    console.error(
      "AI Search error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("429") || error.message.includes("quota")) {
        return errorResponse(
          "API quota exceeded. Please try again later or use a different API key.",
          503,
        );
      }
      if (
        error.message.includes("timeout") ||
        error.message.includes("ECONNRESET")
      ) {
        return errorResponse(
          "External API timeout. Please try again with a simpler query.",
          504,
        );
      }
    }

    return errorResponse("An internal error occurred. Please try again.", 500);
  }
}
