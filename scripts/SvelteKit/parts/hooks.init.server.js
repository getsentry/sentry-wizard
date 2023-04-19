import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: '___DSN___',
  tracesSampleRate: 1.0,
});
