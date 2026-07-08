import { logger } from '@/lib/infrastructure/logger';
import type { EmailJobData } from '../types';

export async function handleEmailJob(data: EmailJobData) {
  logger.info(`[worker:email] Processing email job`);
  const { sendEmailNow } = await import('@/lib/services/email');
  return sendEmailNow(data);
}
