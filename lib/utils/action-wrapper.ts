import { logger } from '@/lib/infrastructure/logger';

export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[safeAction]', { error: message });
    return { data: null, error: message };
  }
}
