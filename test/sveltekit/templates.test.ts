import {
  getClientHooksTemplate,
  getServerHooksTemplate,
} from '../../src/sveltekit/templates';

describe('getClientHooksTemplate', () => {
  it('should generate client hooks template with all features enabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: true,
      replay: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,

        // This sets the sample rate to be 10%. You may want this to be 100% while
        // in development and sample at a lower rate in production
        replaysSessionSampleRate: 0.1,

        // If the entire session is not sampled, use the below sample rate to sample
        // sessions when an error occurs.
        replaysOnErrorSampleRate: 1.0,

        // If you don't want to use Session Replay, just remove the line below:
        integrations: [replayIntegration()],
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('should generate client hooks template when performance disabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: false,
      replay: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        // This sets the sample rate to be 10%. You may want this to be 100% while
        // in development and sample at a lower rate in production
        replaysSessionSampleRate: 0.1,

        // If the entire session is not sampled, use the below sample rate to sample
        // sessions when an error occurs.
        replaysOnErrorSampleRate: 1.0,

        // If you don't want to use Session Replay, just remove the line below:
        integrations: [replayIntegration()],
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('should generate client hooks template when replay disabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: true,
      replay: false,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,


      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });
});

describe('getServerHooksTemplate', () => {
  it('should generate server hooks template with all features enabled', () => {
    const result = getServerHooksTemplate('https://sentry.io/123', {
      performance: true,
      replay: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,

        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });

      // If you have custom handlers, make sure to place them after \`sentryHandle()\` in the \`sequence\` function.
      export const handle = sequence(sentryHandle());

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('should generate server hooks template when performance disabled', () => {
    const result = getServerHooksTemplate('https://sentry.io/123', {
      performance: false,
      replay: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });

      // If you have custom handlers, make sure to place them after \`sentryHandle()\` in the \`sequence\` function.
      export const handle = sequence(sentryHandle());

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });
});
