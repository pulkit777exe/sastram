export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  retries = 3,
  baseDelayMs = 300,
  timeoutMs = 15_000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fn(controller.signal);
    } catch (error) {
      lastError = error;
      if (attempt >= retries - 1) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed");
}
