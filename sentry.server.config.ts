import * as Sentry from '@sentry/nextjs';
import { sentryPrivacyOptions } from './lib/observability/sentry';

const tracesSampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  ...sentryPrivacyOptions,
});
