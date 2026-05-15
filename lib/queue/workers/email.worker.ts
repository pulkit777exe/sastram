import type { Job } from 'bullmq';
import { logger } from '@/lib/infrastructure/logger';
import type { EmailJobData } from '../types';

export async function handleEmailJob(job: Job<EmailJobData>) {
  logger.info(`[worker:email] Processing job ${job.id}`);
  const { sendEmailNow } = await import('@/lib/services/email');
  return sendEmailNow(job.data);
}
