const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thrown when a caller-supplied external signal aborts. Terminal: never
 * retried (the caller asked us to stop, so more attempts are wasted work).
 */
export class AbortError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isAbortError(error: unknown): error is AbortError {
  return error instanceof AbortError;
}

function computeBackoffDelay(baseDelayMs: number, attemptIndex: number): number {
  const exponentialFactor = Math.pow(2, attemptIndex);
  const jitter = Math.floor(Math.random() * 100);
  return baseDelayMs * exponentialFactor + jitter;
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

/** Backoff sleep that rejects with AbortError as soon as the external signal aborts. */
function delayWithSignal(delayMs: number, externalSignal?: AbortSignal): Promise<void> {
  if (externalSignal === undefined) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (externalSignal.aborted) return Promise.reject(new AbortError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      externalSignal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    externalSignal.addEventListener('abort', onAbort, { once: true });
    // Cover an abort that landed between the pre-check and listener registration.
    if (externalSignal.aborted) onAbort();
  });
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
    // The caller's signal is terminal: surface a dedicated AbortError instead
    // of burning the remaining attempts against an already-aborted signal.
    if (externalSignal !== undefined && externalSignal.aborted) {
      throw new AbortError();
    }

    const { controller, clear } = createTimeoutController(timeoutMs, externalSignal);

    try {
      const result = await task(controller.signal);
      clear();
      return result;
    } catch (taskError) {
      lastError = taskError;
      clear();
      // External abort is non-retryable (per-attempt timeouts stay retryable).
      if (externalSignal !== undefined && externalSignal.aborted) {
        throw new AbortError();
      }
      // Don't retry non-retryable errors: AppError 4xx, Prisma P2002, quota
      const code = (taskError as { code?: string })?.code;
      const status = (taskError as { statusCode?: number })?.statusCode;
      const message = taskError instanceof Error ? taskError.message : String(taskError);
      const isNonRetryable =
        (typeof status === 'number' && status >= 400 && status < 500) ||
        code === 'P2002' ||
        /quota|RATE_LIMITED|VALIDATION_ERROR/i.test(message) ||
        /429/.test(message);
      if (isNonRetryable) throw taskError;
      const isLastAttempt = attemptIndex >= retries - 1;
      if (isLastAttempt) {
        throw taskError;
      }
      const delayMs = computeBackoffDelay(baseDelayMs, attemptIndex);
      await delayWithSignal(delayMs, externalSignal);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Retry failed');
}
