import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [Sentry.replayIntegration()],
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  enableLogs: true,
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  replaysOnErrorSampleRate: 1,
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;