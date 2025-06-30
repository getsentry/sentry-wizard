import { describe, expect, it } from 'vitest';
import {
  getRootLayout,
  getSentryServersideConfigContents,
  getInstrumentationClientFileContents,
  getWithSentryConfigOptionsTemplate,
  getGenerateMetadataSnippet,
  getRootLayoutWithGenerateMetadata,
  getSentryExamplePageContents,
  getSentryExamplePagesDirApiRoute,
  getSentryExampleAppDirApiRoute,
} from '../../src/nextjs/templates';

describe('Next.js code templates', () => {
  describe('getInstrumentationClientFileContents', () => {
    it('generates client-side Sentry config with all features enabled', () => {
      const template = getInstrumentationClientFileContents('my-dsn', {
        performance: true,
        replay: true,
      });

      expect(template).toMatchInlineSnapshot(`
        "// This file configures the initialization of Sentry on the client.
        // The added config here will be used whenever a users loads a page in their browser.
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

        export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;"
      `);
    });

    it('generates client-side Sentry config with performance monitoring disabled', () => {
      const template = getInstrumentationClientFileContents('my-dsn', {
        performance: false,
        replay: true,
      });

      expect(template).toMatchInlineSnapshot(`
        "// This file configures the initialization of Sentry on the client.
        // The added config here will be used whenever a users loads a page in their browser.
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

        export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;"
      `);
    });

    it('generates client-side Sentry config with session replay disabled', () => {
      const template = getInstrumentationClientFileContents('my-dsn', {
        performance: true,
        replay: false,
      });

      expect(template).toMatchInlineSnapshot(`
        "// This file configures the initialization of Sentry on the client.
        // The added config here will be used whenever a users loads a page in their browser.
        // https://docs.sentry.io/platforms/javascript/guides/nextjs/

        import * as Sentry from "@sentry/nextjs";

        Sentry.init({
          dsn: "my-dsn",

          // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
          tracesSampleRate: 1,

          // Setting this option to true will print useful information to the console while you're setting up Sentry.
          debug: false,
        });

        export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;"
      `);
    });
  });

  describe('getSentryServersideConfigContents', () => {
    describe('server-side', () => {
      it('generates server-side Sentry config with all features enabled', () => {
        const template = getSentryServersideConfigContents('my-dsn', 'server', {
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
        const template = getSentryServersideConfigContents('my-dsn', 'server', {
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
        const template = getSentryServersideConfigContents('my-dsn', 'server', {
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
        const template = getSentryServersideConfigContents('my-dsn', 'edge', {
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
        const template = getSentryServersideConfigContents('my-dsn', 'edge', {
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
  });

  describe('getRootLayout', () => {
    it('generates a root layout component with types', () => {
      expect(getRootLayout(true)).toMatchInlineSnapshot(`
        "// This file was generated by the Sentry wizard because we couldn't find a root layout file.
        // You can delete this file at any time.

        export const metadata = {
          title: 'Sentry NextJS Example',
          description: 'Generated by Sentry',
        }

        export default function RootLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }
        "
      `);
    });
    it('generates a root layout component without types', () => {
      expect(getRootLayout(false)).toMatchInlineSnapshot(`
        "// This file was generated by the Sentry wizard because we couldn't find a root layout file.
        // You can delete this file at any time.

        export const metadata = {
          title: 'Sentry NextJS Example',
          description: 'Generated by Sentry',
        }

        export default function RootLayout({
          children,
        }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }
        "
      `);
    });
  });

  describe('getGenerateMetadataSnippet', () => {
    it('generates metadata snippet with TypeScript types', () => {
      const template = getGenerateMetadataSnippet(true);

      expect(template).toMatchInlineSnapshot(`
"
      import * as Sentry from '@sentry/nextjs';
      import type { Metadata } from 'next';

      // Add or edit your "generateMetadata" to include the Sentry trace data:
      export function generateMetadata(): Metadata {
        return {
          // ... your existing metadata
          other: {
            ...Sentry.getTraceData()
          }
        };
      }
"
`);
    });

    it('generates metadata snippet without TypeScript types', () => {
      const template = getGenerateMetadataSnippet(false);

      expect(template).toMatchInlineSnapshot(`
"
      import * as Sentry from '@sentry/nextjs';
      

      // Add or edit your "generateMetadata" to include the Sentry trace data:
      export function generateMetadata() {
        return {
          // ... your existing metadata
          other: {
            ...Sentry.getTraceData()
          }
        };
      }
"
    `);
    });
  });

  describe('getRootLayoutWithGenerateMetadata', () => {
    it('generates root layout with TypeScript types', () => {
      const template = getRootLayoutWithGenerateMetadata(true);

      expect(template).toMatchInlineSnapshot(`
        "// This file was generated by the Sentry wizard because we couldn't find a root layout file.
        import * as Sentry from '@sentry/nextjs';
        import type { Metadata } from 'next';

        export function generateMetadata(): Metadata {
          return {
            other: {
              ...Sentry.getTraceData(),
            }
          }
        };

        export default function RootLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }
        "
      `);
    });

    it('generates root layout without TypeScript types', () => {
      const template = getRootLayoutWithGenerateMetadata(false);

      expect(template).toMatchInlineSnapshot(`
        "// This file was generated by the Sentry wizard because we couldn't find a root layout file.
        import * as Sentry from '@sentry/nextjs';

        
        export function generateMetadata() {
          return {
            other: {
              ...Sentry.getTraceData(),
            }
          }
        };

        export default function RootLayout({
          children,
        }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }
        "
      `);
    });
  });

  describe('getSentryExamplePageContents', () => {
    it('generates example page with TypeScript types', () => {
      const template = getSentryExamplePageContents({
        selfHosted: false,
        sentryUrl: 'https://sentry.io',
        orgSlug: 'my-org',
        projectId: '123',
        useClient: true,
        isTypeScript: true,
      });

      expect(template).toContain('"use client";');
      expect(template).toContain('constructor(message: string | undefined)');
      expect(template).toContain(
        'class SentryExampleFrontendError extends Error',
      );
    });

    it('generates example page without TypeScript types', () => {
      const template = getSentryExamplePageContents({
        selfHosted: false,
        sentryUrl: 'https://sentry.io',
        orgSlug: 'my-org',
        projectId: '123',
        useClient: true,
        isTypeScript: false,
      });

      expect(template).toContain('"use client";');
      expect(template).toContain('constructor(message)');
      expect(template).toContain(
        'class SentryExampleFrontendError extends Error',
      );
    });

    it('generates example page without useClient directive', () => {
      const template = getSentryExamplePageContents({
        selfHosted: false,
        sentryUrl: 'https://sentry.io',
        orgSlug: 'my-org',
        projectId: '123',
        useClient: false,
        isTypeScript: true,
      });

      expect(template).not.toContain('"use client";');
      expect(template).toContain(
        'https://my-org.sentry.io/issues/?project=123',
      );
    });
  });

  describe('getSentryExamplePagesDirApiRoute', () => {
    it('generates Pages Router API route with TypeScript types', () => {
      const template = getSentryExamplePagesDirApiRoute({
        isTypeScript: true,
      });

      expect(template).toContain('constructor(message: string | undefined)');
      expect(template).toContain('class SentryExampleAPIError extends Error');
      expect(template).toContain('export default function handler(_req, res)');
    });

    it('generates Pages Router API route without TypeScript types', () => {
      const template = getSentryExamplePagesDirApiRoute({
        isTypeScript: false,
      });

      expect(template).toContain('constructor(message)');
      expect(template).toContain('class SentryExampleAPIError extends Error');
      expect(template).toContain('export default function handler(_req, res)');
    });
  });

  describe('getSentryExampleAppDirApiRoute', () => {
    it('generates App Router API route with TypeScript types', () => {
      const template = getSentryExampleAppDirApiRoute({
        isTypeScript: true,
      });

      expect(template).toContain('constructor(message: string | undefined)');
      expect(template).toContain('class SentryExampleAPIError extends Error');
      expect(template).toContain('export function GET()');
      expect(template).toContain('export const dynamic = "force-dynamic";');
    });

    it('generates App Router API route without TypeScript types', () => {
      const template = getSentryExampleAppDirApiRoute({
        isTypeScript: false,
      });

      expect(template).toContain('constructor(message)');
      expect(template).toContain('class SentryExampleAPIError extends Error');
      expect(template).toContain('export function GET()');
      expect(template).toContain('export const dynamic = "force-dynamic";');
    });
  });
});
