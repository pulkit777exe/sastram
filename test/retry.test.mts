import { describe, it } from 'mocha';
import { expect } from 'chai';
import { AppError } from '@/lib/utils/errors';
import { AbortError, withRetry } from '@/lib/utils/retry';

/** Task that never settles on its own — rejects when the attempt signal aborts. */
function abortableTask(onAttempt: () => void): (signal: AbortSignal) => Promise<never> {
  return (signal) => {
    onAttempt();
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };
}

describe('withRetry', () => {
  it('short-circuits with AbortError when the external signal aborts (no further attempts)', async () => {
    const external = new AbortController();
    let attempts = 0;

    const promise = withRetry(abortableTask(() => { attempts += 1; }), 3, 1, 60_000, external.signal);
    setTimeout(() => external.abort(), 5);

    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(AbortError);
    expect(attempts).to.equal(1);
  });

  it('stops mid-backoff when the external signal aborts', async () => {
    const external = new AbortController();
    let attempts = 0;
    const startedAt = Date.now();

    const promise = withRetry(
      async () => {
        attempts += 1;
        throw new Error('transient failure');
      },
      3,
      5_000,
      15_000,
      external.signal
    );
    setTimeout(() => external.abort(), 10);

    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(AbortError);
    expect(attempts).to.equal(1);
    expect(Date.now() - startedAt).to.be.lessThan(1_000);
  });

  it('throws AbortError immediately when the external signal is already aborted', async () => {
    const external = new AbortController();
    external.abort();
    let attempts = 0;

    let caught: unknown;
    try {
      await withRetry(async () => {
        attempts += 1;
        return 'never';
      }, 3, 1, 60_000, external.signal);
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(AbortError);
    expect(attempts).to.equal(0);
  });

  it('retries after a per-attempt timeout and succeeds', async () => {
    let attempts = 0;

    const recovered = await withRetry(async (signal) => {
      attempts += 1;
      if (attempts === 1) {
        // First attempt hits the 10ms per-attempt timeout, which is retryable.
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return 'ok';
    }, 3, 1, 10);

    expect(recovered).to.equal('ok');
    expect(attempts).to.equal(2);
  });

  it('runs per-attempt timeouts to exhaustion without surfacing AbortError', async () => {
    let attempts = 0;

    let caught: unknown;
    try {
      await withRetry(abortableTask(() => { attempts += 1; }), 3, 1, 10);
    } catch (error) {
      caught = error;
    }

    expect(caught).to.not.be.instanceOf(AbortError);
    expect(attempts).to.equal(3);
  });

  it('passes non-retryable AppError through without retrying', async () => {
    let attempts = 0;

    let caught: unknown;
    try {
      await withRetry(async () => {
        attempts += 1;
        throw new AppError('Invalid input', 'VALIDATION_ERROR', 400);
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(AppError);
    expect((caught as AppError).code).to.equal('VALIDATION_ERROR');
    expect(attempts).to.equal(1);
  });
});
