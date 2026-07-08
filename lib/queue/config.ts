export const QUEUE_NAMES = {
  THREAD_SUMMARY: 'thread-summary',
  RESOLUTION_SCORE: 'resolution-score',
  THREAD_DNA: 'thread-dna',
  CONFLICT_DETECTION: 'conflict-detection',
  DAILY_DIGEST: 'daily-digest',
  AI_INSIGHT_NOTIFICATIONS: 'ai-insight-notifications',
  EMAIL: 'email',
  AI_INLINE: 'ai-inline',
  STALENESS_CHECK: 'staleness-check',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export enum AIJobType {
  GENERATE_THREAD_SUMMARY = 'generate-thread-summary',
  GENERATE_THREAD_DNA = 'generate-thread-dna',
  CALCULATE_RESOLUTION_SCORE = 'calculate-resolution-score',
  DETECT_CONFLICTS = 'detect-conflicts',
  GENERATE_DAILY_DIGEST = 'generate-daily-digest',
  SEND_AI_INSIGHT_NOTIFICATIONS = 'send-ai-insight-notifications',
  GENERATE_AI_INLINE = 'generate-ai-inline',
}
