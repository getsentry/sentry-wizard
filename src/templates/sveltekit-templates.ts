export function getClientHooksTemplate(dsn: string) {
  return `import { handleErrorWithSentry, Replay } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: '${dsn}',
  tracesSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  replaysOnErrorSampleRate: 1.0,
  
  // If you don't want to use Session Replay, just remove the line below:
  integrations: [new Replay()],
});

// If you have a custom error handler, pass it to \`handleErrorWithSentry\`
export const handleError = handleErrorWithSentry();
`;
}

export function getServerHooksTemplate(dsn: string) {
  return `import { sequence } from "@sveltejs/kit/hooks";
import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: '${dsn}',
  tracesSampleRate: 1.0,
});

// If you have custom handlers, make sure to place them after \`sentryHandle()\` in the \`sequence\` function.
export const handle = sequence(sentryHandle());

// If you have a custom error handler, pass it to \`handleErrorWithSentry\`
export const handleError = handleErrorWithSentry();
`;
}
