import {
  getSentryConfigContents,
  getWithSentryConfigOptionsTemplate,
} from '../../src/nextjs/templates';

describe('Next.js code templates', () => {
  describe('getSentryConfigContents', () => {
    describe('client-side', () => {
      it('generates client-side Sentry config with all features enabled', () => {
        const template = getSentryConfigContents('my-dsn', 'client', {
          performance: true,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the client.
          // The config you add here will be used whenever a users loads a page in their browser.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Add optional integrations for additional features
            integrations: [
              Sentry.replayIntegration(),
            ],

            // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
            tracesSampleRate: 1,

            // Define how likely Replay events are sampled.
            // This sets the sample rate to be 10%. You may want this to be 100% while
            // in development and sample at a lower rate in production
            replaysSessionSampleRate: 0.1,

            // Define how likely Replay events are sampled when an error occurs.
            replaysOnErrorSampleRate: 1.0,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates client-side Sentry config with performance monitoring disabled', () => {
        const template = getSentryConfigContents('my-dsn', 'client', {
          performance: false,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the client.
          // The config you add here will be used whenever a users loads a page in their browser.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Add optional integrations for additional features
            integrations: [
              Sentry.replayIntegration(),
            ],

            // Define how likely Replay events are sampled.
            // This sets the sample rate to be 10%. You may want this to be 100% while
            // in development and sample at a lower rate in production
            replaysSessionSampleRate: 0.1,

            // Define how likely Replay events are sampled when an error occurs.
            replaysOnErrorSampleRate: 1.0,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates client-side Sentry config with session replay disabled', () => {
        const template = getSentryConfigContents('my-dsn', 'client', {
          performance: true,
          replay: false,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the client.
          // The config you add here will be used whenever a users loads a page in their browser.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
            tracesSampleRate: 1,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });
    });

    describe('server-side', () => {
      it('generates server-side Sentry config with all features enabled', () => {
        const template = getSentryConfigContents('my-dsn', 'server', {
          performance: true,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the server.
          // The config you add here will be used whenever the server handles a request.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
            tracesSampleRate: 1,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates server-side Sentry config with performance monitoring disabled', () => {
        const template = getSentryConfigContents('my-dsn', 'server', {
          performance: false,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the server.
          // The config you add here will be used whenever the server handles a request.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates server-side Sentry config with spotlight disabled', () => {
        const template = getSentryConfigContents('my-dsn', 'server', {
          performance: true,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry on the server.
          // The config you add here will be used whenever the server handles a request.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
            tracesSampleRate: 1,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });
    });

    describe('edge', () => {
      it('generates edge Sentry config with all features enabled', () => {
        const template = getSentryConfigContents('my-dsn', 'edge', {
          performance: true,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
          // The config you add here will be used whenever one of the edge features is loaded.
          // Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
            tracesSampleRate: 1,

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });

      it('generates edge Sentry config with performance monitoring disabled', () => {
        const template = getSentryConfigContents('my-dsn', 'edge', {
          performance: false,
          replay: true,
        });

        expect(template).toMatchInlineSnapshot(`
          "// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
          // The config you add here will be used whenever one of the edge features is loaded.
          // Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
          // https://docs.sentry.io/platforms/javascript/guides/nextjs/

          import * as Sentry from "@sentry/nextjs";

          Sentry.init({
            dsn: "my-dsn",

            // Setting this option to true will print useful information to the console while you're setting up Sentry.
            debug: false,
          });
          "
        `);
      });
    });
  });

  describe('getWithSentryConfigOptionsTemplate', () => {
    it('generates options for SaaS', () => {
      const template = getWithSentryConfigOptionsTemplate({
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: false,
        sentryUrl: 'https://dont-use-this-url.com',
        tunnelRoute: true,
        reactComponentAnnotation: false,
      });

      expect(template).toMatchInlineSnapshot(`
        "{
            // For all available options, see:
            // https://www.npmjs.com/package/@sentry/webpack-plugin#options

            org: "my-org",
            project: "my-project",

            // Only print logs for uploading source maps in CI
            silent: !process.env.CI,

            // For all available options, see:
            // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,

            // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
            // This can increase your server load as well as your hosting bill.
            // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
            // side errors will fail.
            tunnelRoute: "/monitoring",

            // Automatically tree-shake Sentry logger statements to reduce bundle size
            disableLogger: true,

            // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
            // See the following for more information:
            // https://docs.sentry.io/product/crons/
            // https://vercel.com/docs/cron-jobs
            automaticVercelMonitors: true,
          }"
      `);
    });

    it('generates options for self-hosted', () => {
      const template = getWithSentryConfigOptionsTemplate({
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: true,
        sentryUrl: 'https://my-sentry.com',
        tunnelRoute: true,
        reactComponentAnnotation: false,
      });

      expect(template).toMatchInlineSnapshot(`
        "{
            // For all available options, see:
            // https://www.npmjs.com/package/@sentry/webpack-plugin#options

            org: "my-org",
            project: "my-project",
            sentryUrl: "https://my-sentry.com",

            // Only print logs for uploading source maps in CI
            silent: !process.env.CI,

            // For all available options, see:
            // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,

            // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
            // This can increase your server load as well as your hosting bill.
            // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
            // side errors will fail.
            tunnelRoute: "/monitoring",

            // Automatically tree-shake Sentry logger statements to reduce bundle size
            disableLogger: true,

            // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
            // See the following for more information:
            // https://docs.sentry.io/product/crons/
            // https://vercel.com/docs/cron-jobs
            automaticVercelMonitors: true,
          }"
      `);
    });

    it('comments out tunnelRoute if `tunnelRoute` option is disabled', () => {
      const template = getWithSentryConfigOptionsTemplate({
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: false,
        sentryUrl: 'https://dont-use-this-url.com',
        tunnelRoute: false,
        reactComponentAnnotation: false,
      });

      expect(template).toMatchInlineSnapshot(`
        "{
            // For all available options, see:
            // https://www.npmjs.com/package/@sentry/webpack-plugin#options

            org: "my-org",
            project: "my-project",

            // Only print logs for uploading source maps in CI
            silent: !process.env.CI,

            // For all available options, see:
            // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,

            // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
            // This can increase your server load as well as your hosting bill.
            // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
            // side errors will fail.
            // tunnelRoute: "/monitoring",

            // Automatically tree-shake Sentry logger statements to reduce bundle size
            disableLogger: true,

            // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
            // See the following for more information:
            // https://docs.sentry.io/product/crons/
            // https://vercel.com/docs/cron-jobs
            automaticVercelMonitors: true,
          }"
      `);
    });

    it('adds `reactComponentAnnotations` option if `reactComponentAnnotations` is enabled', () => {
      const template = getWithSentryConfigOptionsTemplate({
        orgSlug: 'my-org',
        projectSlug: 'my-project',
        selfHosted: false,
        sentryUrl: 'https://dont-use-this-url.com',
        tunnelRoute: true,
        reactComponentAnnotation: true,
      });

      expect(template).toMatchInlineSnapshot(`
        "{
            // For all available options, see:
            // https://www.npmjs.com/package/@sentry/webpack-plugin#options

            org: "my-org",
            project: "my-project",

            // Only print logs for uploading source maps in CI
            silent: !process.env.CI,

            // For all available options, see:
            // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,

            // Automatically annotate React components to show their full name in breadcrumbs and session replay
            reactComponentAnnotation: {
              enabled: true,
            },

            // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
            // This can increase your server load as well as your hosting bill.
            // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
            // side errors will fail.
            tunnelRoute: "/monitoring",

            // Automatically tree-shake Sentry logger statements to reduce bundle size
            disableLogger: true,

            // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
            // See the following for more information:
            // https://docs.sentry.io/product/crons/
            // https://vercel.com/docs/cron-jobs
            automaticVercelMonitors: true,
          }"
            `);
    });
  });
});
