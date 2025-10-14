import { describe, expect, it, vi } from 'vitest';
import {
  getDefaultNuxtConfig,
  getNuxtModuleFallbackTemplate,
  getSentryConfigContents,
} from '../../src/nuxt/templates';

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

describe('Nuxt code templates', () => {
  describe('getDefaultNuxtConfig', () => {
    it('returns a default nuxt config', () => {
      expect(getDefaultNuxtConfig()).toMatchInlineSnapshot(`
      "// https://nuxt.com/docs/api/configuration/nuxt-config
      export default defineNuxtConfig({
        compatibilityDate: '2024-04-03',
        devtools: { enabled: true }
      })
      "
`);
    });
  });

  describe('getSentryConfigContents', () => {
    describe('client config', () => {
      it('generates Sentry config with all features enabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: true,
            replay: true,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // We recommend adjusting this value in production, or using tracesSampler
            // for finer control
            tracesSampleRate: 1.0,

            // This sets the sample rate to be 10%. You may want this to be 100% while
            // in development and sample at a lower rate in production
            replaysSessionSampleRate: 0.1,
            
            // If the entire session is not sampled, use the below sample rate to sample
            // sessions when an error occurs.
            replaysOnErrorSampleRate: 1.0,
            
            // If you don't want to use Session Replay, just remove the line below:
            integrations: [Sentry.replayIntegration()],

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });

      it('generates Sentry config with performance monitoring disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: false,
            replay: true,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // This sets the sample rate to be 10%. You may want this to be 100% while
            // in development and sample at a lower rate in production
            replaysSessionSampleRate: 0.1,
            
            // If the entire session is not sampled, use the below sample rate to sample
            // sessions when an error occurs.
            replaysOnErrorSampleRate: 1.0,
            
            // If you don't want to use Session Replay, just remove the line below:
            integrations: [Sentry.replayIntegration()],

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });

      it('generates Sentry config with session replay disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: true,
            replay: false,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // We recommend adjusting this value in production, or using tracesSampler
            // for finer control
            tracesSampleRate: 1.0,

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates Sentry config with logs disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: true,
            replay: true,
            logs: false,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // We recommend adjusting this value in production, or using tracesSampler
            // for finer control
            tracesSampleRate: 1.0,

            // This sets the sample rate to be 10%. You may want this to be 100% while
            // in development and sample at a lower rate in production
            replaysSessionSampleRate: 0.1,
            
            // If the entire session is not sampled, use the below sample rate to sample
            // sessions when an error occurs.
            replaysOnErrorSampleRate: 1.0,
            
            // If you don't want to use Session Replay, just remove the line below:
            integrations: [Sentry.replayIntegration()],

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates Sentry config with performance monitoring and session replay disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: false,
            replay: false,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates Sentry config with all features disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'client',
          {
            performance: false,
            replay: false,
            logs: false,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";

          Sentry.init({
            // If set up, you can use your runtime config here
            // dsn: useRuntimeConfig().public.sentry.dsn,
            dsn: "https://sentry.io/123",

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });
    });

    describe('server config', () => {
      it('generates Sentry config with all features enabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'server',
          {
            performance: true,
            replay: true,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";
           
          Sentry.init({
            dsn: "https://sentry.io/123",

            // We recommend adjusting this value in production, or using tracesSampler
            // for finer control
            tracesSampleRate: 1.0,

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });

      it('generates Sentry config with performance monitoring disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'server',
          {
            performance: false,
            replay: true,
            logs: true,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";
           
          Sentry.init({
            dsn: "https://sentry.io/123",

            // Enable logs to be sent to Sentry
            enableLogs: true,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });

      it('generates Sentry config with logs disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'server',
          {
            performance: true,
            replay: true,
            logs: false,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";
           
          Sentry.init({
            dsn: "https://sentry.io/123",

            // We recommend adjusting this value in production, or using tracesSampler
            // for finer control
            tracesSampleRate: 1.0,

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });

      it('generates Sentry config with all features disabled', () => {
        const template = getSentryConfigContents(
          'https://sentry.io/123',
          'server',
          {
            performance: false,
            replay: false,
            logs: false,
          },
        );

        expect(template).toMatchInlineSnapshot(`
          "import * as Sentry from "@sentry/nuxt";
           
          Sentry.init({
            dsn: "https://sentry.io/123",

            // Enable sending of user PII (Personally Identifiable Information)
            // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
            sendDefaultPii: true,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
      `);
      });
    });
  });

  describe('getNuxtModuleFallbackTemplate', () => {
    it('generates configuration options for the nuxt config', () => {
      const template = getNuxtModuleFallbackTemplate(
        {
          org: 'my-org',
          project: 'my-project',
          url: 'https://sentry.io',
          selfHosted: false,
        },
        false,
      );

      expect(template).toMatchInlineSnapshot(`
        "  modules: ["@sentry/nuxt/module"],
          sentry: {
            sourceMapsUploadOptions: {
              org: "my-org",
              project: "my-project",
            },
          },
          sourcemap: { client: "hidden" },"
      `);
    });

    it('generates configuration options for the nuxt config with top level import', () => {
      const template = getNuxtModuleFallbackTemplate(
        {
          org: 'my-org',
          project: 'my-project',
          url: 'https://sentry.io',
          selfHosted: false,
        },
        true,
      );

      expect(template).toMatchInlineSnapshot(`
        "  modules: ["@sentry/nuxt/module"],
          sentry: {
            sourceMapsUploadOptions: {
              org: "my-org",
              project: "my-project",
            },
            autoInjectServerSentry: "top-level-import",
          },
          sourcemap: { client: "hidden" },"
      `);
    });
  });
});
