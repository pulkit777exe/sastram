import * as Sentry from "@sentry/nextjs";

let serverTracesSampleRate = 1;
if (process.env.NODE_ENV === "production") serverTracesSampleRate = 0.1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: serverTracesSampleRate,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  enableLogs: true,
  sendDefaultPii: true,
});