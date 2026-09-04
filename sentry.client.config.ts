import * as Sentry from "@sentry/nextjs";

let clientTracesSampleRate = 1;
if (process.env.NODE_ENV === "production") clientTracesSampleRate = 0.1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: clientTracesSampleRate,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  enableLogs: true,
  sendDefaultPii: true,
});
