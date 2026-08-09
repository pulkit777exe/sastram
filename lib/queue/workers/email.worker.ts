import { logger } from '@/lib/infrastructure/logger';
import type { EmailJobData } from '../types';

export async function handleEmailJob(data: EmailJobData) {
  logger.info('[worker:email] Processing email job');
  // Deferred import keeps the email service (and its Resend client) out of the
  // module graph until a job actually needs it.
  const { sendEmailNow } = await import('@/lib/services/email');
  return sendEmailNow(data);
}
