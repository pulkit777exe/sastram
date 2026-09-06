const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_TIMEOUT_MS = 15_000;

function computeBackoffDelay(baseDelayMs: number, attemptIndex: number): number {
  const exponentialFactor = Math.pow(2, attemptIndex);
  return baseDelayMs * exponentialFactor;
}

function createTimeoutController(timeoutMs: number, externalSignal?: AbortSignal): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal !== undefined && externalSignal.aborted) {
    controller.abort();
  }

  const onExternalAbort = () => controller.abort();
  if (externalSignal !== undefined) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    controller,
    clear: () => {
      clearTimeout(timeoutId);
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

export async function withRetry<T>(
  task: (signal: AbortSignal) => Promise<T>,
  retries = DEFAULT_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<T> {
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex < retries; attemptIndex += 1) {
    const { controller, clear } = createTimeoutController(timeoutMs, externalSignal);

    try {
      const result = await task(controller.signal);
      clear();
      return result;
    } catch (taskError) {
      lastError = taskError;
      clear();
      const isLastAttempt = attemptIndex >= retries - 1;
      if (isLastAttempt) {
        throw taskError;
      }
      const delayMs = computeBackoffDelay(baseDelayMs, attemptIndex);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Retry failed');
}
