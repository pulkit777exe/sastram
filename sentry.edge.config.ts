import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
  enableLogs: true,
  sendDefaultPii: true,
});