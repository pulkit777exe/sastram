import * as Sentry from '@sentry/nextjs';
import { sentryPrivacyOptions } from './lib/observability/sentry';

let clientTracesSampleRate = 1;
if (process.env.NODE_ENV === 'production') clientTracesSampleRate = 0.1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  ...sentryPrivacyOptions,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: clientTracesSampleRate,
  enableLogs: true,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
