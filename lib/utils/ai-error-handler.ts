import { logger } from "@/lib/infrastructure/logger";

export type AIProvider = "exa" | "tavily" | "gemini";

export type AIToastKey =
  | "exaRateLimited"
  | "tavilyError"
  | "geminiDown"
  | "aiUnavailable"
  | "aiTimeout"
  | "networkError"
  | "partialResults";

export type AIProviderStatus =
  | "success"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "network_error"
  | "error";

export interface AIProviderResult<T> {
  provider: AIProvider;
  status: AIProviderStatus;
  data: T | null;
  error: string | null;
  toastKey?: AIToastKey;
}

export interface MultiProviderResult<T> {
  results: Partial<Record<AIProvider, T>>;
  errors: Partial<Record<AIProvider, string>>;
  partial: boolean;
  toastKey?: AIToastKey;
}

function toastKeyForStatus(
  provider: AIProvider,
  status: AIProviderStatus,
): AIToastKey | undefined {
  if (status === "rate_limited") {
    return provider === "exa" ? "exaRateLimited" : "aiUnavailable";
  }

  if (status === "unavailable") {
    if (provider === "gemini") return "geminiDown";
    if (provider === "tavily") return "tavilyError";
    return "aiUnavailable";
  }

  if (status === "timeout") {
    return "aiTimeout";
  }

  if (status === "network_error") {
    return "networkError";
  }

  return undefined;
}

function normalizeError(
  provider: AIProvider,
  error: unknown,
): { status: AIProviderStatus; message: string; toastKey?: AIToastKey } {
  const message = error instanceof Error ? error.message : "Unknown error";

  const axiosLikeStatus =
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: unknown } }).response?.status ===
      "number"
      ? Number((error as { response: { status: number } }).response.status)
      : null;

  const statusCode =
    axiosLikeStatus ??
    (typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : null);

  if (statusCode === 429) {
    return {
      status: "rate_limited",
      message,
      toastKey: toastKeyForStatus(provider, "rate_limited"),
    };
  }

  if (statusCode === 503) {
    return {
      status: "unavailable",
      message,
      toastKey: toastKeyForStatus(provider, "unavailable"),
    };
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      status: "timeout",
      message,
      toastKey: toastKeyForStatus(provider, "timeout"),
    };
  }

  if (/timeout/i.test(message)) {
    return {
      status: "timeout",
      message,
      toastKey: toastKeyForStatus(provider, "timeout"),
    };
  }

  if (/network|failed to fetch|enotfound|econnreset|econnrefused/i.test(message)) {
    return {
      status: "network_error",
      message,
      toastKey: toastKeyForStatus(provider, "network_error"),
    };
  }

  return {
    status: "error",
    message,
    toastKey: toastKeyForStatus(provider, "error"),
  };
}

export async function runAIProviderCall<T>(args: {
  provider: AIProvider;
  call: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number;
}): Promise<AIProviderResult<T>> {
  const { provider, call, timeoutMs = 15000 } = args;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const data = await call(controller.signal);

    return {
      provider,
      status: "success",
      data,
      error: null,
    };
  } catch (error) {
    const normalized = normalizeError(provider, error);

    logger.error(`[ai:${provider}]`, {
      status: normalized.status,
      error: normalized.message,
    });

    return {
      provider,
      status: normalized.status,
      data: null,
      error: normalized.message,
      toastKey: normalized.toastKey,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAIProviderSet<T>(
  calls: Array<{
    provider: AIProvider;
    call: (signal: AbortSignal) => Promise<T>;
    timeoutMs?: number;
  }>,
): Promise<MultiProviderResult<T>> {
  const settled = await Promise.all(
    calls.map((entry) => runAIProviderCall(entry)),
  );

  const results: Partial<Record<AIProvider, T>> = {};
  const errors: Partial<Record<AIProvider, string>> = {};

  for (const entry of settled) {
    if (entry.status === "success" && entry.data !== null) {
      results[entry.provider] = entry.data;
      continue;
    }

    if (entry.error) {
      errors[entry.provider] = entry.error;
      logger.error(`[ai:${entry.provider}] provider failed`, {
        status: entry.status,
        error: entry.error,
      });
    }
  }

  const successCount = Object.keys(results).length;
  const failureCount = Object.keys(errors).length;
  const partial = successCount > 0 && failureCount > 0;

  if (partial) {
    return {
      results,
      errors,
      partial: true,
      toastKey: "partialResults",
    };
  }

  return {
    results,
    errors,
    partial: false,
    toastKey: failureCount > 0 ? "aiUnavailable" : undefined,
  };
}
