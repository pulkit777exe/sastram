import * as Sentry from "@sentry/nextjs";

let clientTracesSampleRate = 1;
if (process.env.NODE_ENV === "production") clientTracesSampleRate = 0.1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [Sentry.replayIntegration()],
  tracesSampleRate: clientTracesSampleRate,
  enableLogs: true,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;