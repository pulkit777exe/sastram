import { logger } from '@/lib/infrastructure/logger';

export function logModerationEvent(event: {
  type: string;
  messageId?: string;
  decision?: string;
  confidence?: number;
  timestamp?: Date;
}) {
  const ts = event.timestamp ?? new Date();
  logger.info('[MODERATION]', {
    ...event,
    timestamp: ts.toISOString(),
  });
}
