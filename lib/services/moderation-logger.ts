export function logModerationEvent(event: {
  type: string;
  messageId?: string;
  decision?: string;
  confidence?: number;
  timestamp?: Date;
}) {
  const ts = event.timestamp ?? new Date();
  // Basic structured log; can be wired to external providers later
  // eslint-disable-next-line no-console
  console.log("[MODERATION]", {
    ...event,
    timestamp: ts.toISOString(),
  });
}

