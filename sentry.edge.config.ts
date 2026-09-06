import * as Sentry from "@sentry/nextjs";

let edgeTracesSampleRate = 1;
if (process.env.NODE_ENV === "production") edgeTracesSampleRate = 0.1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: edgeTracesSampleRate,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  enableLogs: true,
  sendDefaultPii: true,
});