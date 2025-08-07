import { describe, expect, it, vi } from 'vitest';
import {
  getClientHooksTemplate,
  getInstrumentationServerTemplate,
  getServerHooksTemplate,
} from '../../src/sveltekit/templates';
import { insertClientInitCall } from '../../src/sveltekit/sdk-setup';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

describe('getClientHooksTemplate', () => {
  it('generates client hooks template with all features enabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: true,
      replay: true,
      logs: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,

        // Enable logs to be sent to Sentry
        enableLogs: true,

        // This sets the sample rate to be 10%. You may want this to be 100% while
        // in development and sample at a lower rate in production
        replaysSessionSampleRate: 0.1,

        // If the entire session is not sampled, use the below sample rate to sample
        // sessions when an error occurs.
        replaysOnErrorSampleRate: 1.0,

        // If you don't want to use Session Replay, just remove the line below:
        integrations: [replayIntegration()],

        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('generates client hooks template when performance disabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: false,
      replay: true,
      logs: false,
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

        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('generates client hooks template when replay disabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: true,
      replay: false,
      logs: false,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,




        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });

  it('generates client hooks template with only logs enabled', () => {
    const result = getClientHooksTemplate('https://sentry.io/123', {
      performance: false,
      replay: false,
      logs: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        // Enable logs to be sent to Sentry
        enableLogs: true,



        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,
      });

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });
});

describe('getServerHooksTemplate', () => {
  it('generates server hooks template with all features enabled', () => {
    const result = getServerHooksTemplate(
      'https://sentry.io/123',
      {
        performance: true,
        replay: true,
        logs: true,
      },
      true,
    );

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,

        // Enable logs to be sent to Sentry
        enableLogs: true,


        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,

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

  it('generates server hooks template when performance disabled', () => {
    const result = getServerHooksTemplate(
      'https://sentry.io/123',
      {
        performance: false,
        replay: true,
        logs: false,
      },
      true,
    );

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',



        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,

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

  it('generates server hooks template with only logs enabled', () => {
    const result = getServerHooksTemplate(
      'https://sentry.io/123',
      {
        performance: false,
        replay: false,
        logs: true,
      },
      true,
    );

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
      import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        // Enable logs to be sent to Sentry
        enableLogs: true,


        // Enable sending user PII (Personally Identifiable Information)
        // https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
        sendDefaultPii: true,

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

  it('generates server hooks template without Sentry.init if includeSentryInit is false', () => {
    const result = getServerHooksTemplate(
      'https://sentry.io/123',
      {
        performance: false,
        replay: false,
        logs: true,
      },
      false,
    );

    expect(result).toMatchInlineSnapshot(`
      "import { sequence } from "@sveltejs/kit/hooks";
      import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";


      // If you have custom handlers, make sure to place them after \`sentryHandle()\` in the \`sequence\` function.
      export const handle = sequence(sentryHandle());

      // If you have a custom error handler, pass it to \`handleErrorWithSentry\`
      export const handleError = handleErrorWithSentry();
      "
    `);
  });
});

describe('getInstrumentationServerTemplate', () => {
  it('generates instrumentation.server template with all features enabled', () => {
    const result = getInstrumentationServerTemplate('https://sentry.io/123', {
      performance: true,
      logs: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,

        // Enable logs to be sent to Sentry
        enableLogs: true,

        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });"`);
  });

  it('generates instrumentation.server template with only logs enabled', () => {
    const result = getInstrumentationServerTemplate('https://sentry.io/123', {
      performance: false,
      logs: true,
    });

    expect(result).toMatchInlineSnapshot(`
      "import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        // Enable logs to be sent to Sentry
        enableLogs: true,

        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });"`);
  });

  it('generates instrumentation.server template with only tracesSampleRate enabled', () => {
    const result = getInstrumentationServerTemplate('https://sentry.io/123', {
      performance: true,
      logs: false,
    });

    expect(result).toMatchInlineSnapshot(`
      "import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',

        tracesSampleRate: 1.0,


        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });"`);
  });

  it('generates instrumentation.server template without any extra features enabled', () => {
    const result = getInstrumentationServerTemplate('https://sentry.io/123', {
      performance: false,
      logs: false,
    });

    expect(result).toMatchInlineSnapshot(`
      "import * as Sentry from '@sentry/sveltekit';

      Sentry.init({
        dsn: 'https://sentry.io/123',


        // uncomment the line below to enable Spotlight (https://spotlightjs.com)
        // spotlight: import.meta.env.DEV,
      });"`);
  });
});

describe('insertClientInitCall', () => {
  it('should insert client init call with all features enabled', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
    `);

    insertClientInitCall('https://sentry.io/123', originalHooksMod, {
      performance: true,
      replay: true,
      logs: true,
    });

    const result = originalHooksMod.generate().code;

    expect(result).toContain('import * as Sentry from "@sentry/sveltekit";');
    expect(result).toContain('dsn: "https://sentry.io/123"');
    expect(result).toContain('tracesSampleRate: 1');
    expect(result).toContain('replaysSessionSampleRate: 0.1');
    expect(result).toContain('replaysOnErrorSampleRate: 1');
    expect(result).toContain('enableLogs: true');
    expect(result).toContain('sendDefaultPii: true');
    expect(result).toContain('integrations: [Sentry.replayIntegration()]');
    expect(result).toContain('Sentry.init({');
  });

  it('should insert client init call with performance disabled', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
    `);

    insertClientInitCall('https://sentry.io/456', originalHooksMod, {
      performance: false,
      replay: true,
      logs: false,
    });

    const result = originalHooksMod.generate().code;

    expect(result).toContain('dsn: "https://sentry.io/456"');
    expect(result).not.toContain('tracesSampleRate');
    expect(result).toContain('replaysSessionSampleRate: 0.1');
    expect(result).toContain('replaysOnErrorSampleRate: 1');
    expect(result).not.toContain('enableLogs: true');
    expect(result).toContain('sendDefaultPii: true');
    expect(result).toContain('integrations: [Sentry.replayIntegration()]');
  });

  it('should insert client init call with replay disabled', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
    `);

    insertClientInitCall('https://sentry.io/789', originalHooksMod, {
      performance: true,
      replay: false,
      logs: true,
    });

    const result = originalHooksMod.generate().code;

    expect(result).toContain('dsn: "https://sentry.io/789"');
    expect(result).toContain('tracesSampleRate: 1');
    expect(result).not.toContain('replaysSessionSampleRate: 0.1');
    expect(result).not.toContain('replaysOnErrorSampleRate: 1');
    expect(result).not.toContain('integrations: [Sentry.replayIntegration()]');
    expect(result).toContain('enableLogs: true');
    expect(result).toContain('sendDefaultPii: true');
    // Note: The comment mentions replaysSessionSampleRate even when replay is disabled
    // This is current behavior of the function
    expect(result).toContain('replaysSessionSampleRate');
  });

  it('should insert client init call with only logs enabled', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
    `);

    insertClientInitCall('https://sentry.io/xyz', originalHooksMod, {
      performance: false,
      replay: false,
      logs: true,
    });

    const result = originalHooksMod.generate().code;

    expect(result).toContain('dsn: "https://sentry.io/xyz"');
    expect(result).not.toContain('tracesSampleRate: 1');
    expect(result).not.toContain('replaysSessionSampleRate: 0.1');
    expect(result).not.toContain('replaysOnErrorSampleRate: 1');
    expect(result).not.toContain('integrations: [Sentry.replayIntegration()]');
    expect(result).toContain('enableLogs: true');
    expect(result).toContain('sendDefaultPii: true');
    // Note: The comment mentions replaysSessionSampleRate even when replay is disabled
    expect(result).toContain('replaysSessionSampleRate');
  });

  it('should insert client init call with all features disabled', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
    `);

    insertClientInitCall('https://sentry.io/minimal', originalHooksMod, {
      performance: false,
      replay: false,
      logs: false,
    });

    const result = originalHooksMod.generate().code;

    expect(result).toContain('dsn: "https://sentry.io/minimal"');
    expect(result).not.toContain('tracesSampleRate: 1');
    expect(result).not.toContain('replaysSessionSampleRate: 0.1');
    expect(result).not.toContain('replaysOnErrorSampleRate: 1');
    expect(result).not.toContain('integrations: [Sentry.replayIntegration()]');
    expect(result).not.toContain('enableLogs: true');
    expect(result).toContain('sendDefaultPii: true');
    // Note: The comment mentions replaysSessionSampleRate even when replay is disabled
    expect(result).toContain('replaysSessionSampleRate');
  });

  it('should insert init call after imports', () => {
    const originalHooksMod = parseModule(`
      import { handleErrorWithSentry } from "@sentry/sveltekit";
      import { somethingElse } from "some-package";
      import * as Sentry from "@sentry/sveltekit";

      export const handleError = handleErrorWithSentry();
      export const someOtherExport = somethingElse();
    `);

    insertClientInitCall('https://sentry.io/order-test', originalHooksMod, {
      performance: true,
      replay: false,
      logs: false,
    });

    const result = originalHooksMod.generate().code;
    const lines = result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line);

    // Find the index of the last import and the Sentry.init call
    const lastImportIndex = Math.max(
      lines.findIndex((line) =>
        line.includes('import { handleErrorWithSentry }'),
      ),
      lines.findIndex((line) => line.includes('import { somethingElse }')),
      lines.findIndex((line) => line.includes('import * as Sentry')),
    );
    const sentryInitIndex = lines.findIndex((line) =>
      line.includes('Sentry.init({'),
    );

    expect(sentryInitIndex).toBeGreaterThan(lastImportIndex);
    expect(result).toContain('Sentry.init({');
  });
});
