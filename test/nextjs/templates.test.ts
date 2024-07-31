import { getWithSentryConfigOptionsTemplate } from '../../src/nextjs/templates';

describe('NextJS code templates', () => {
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
            // https://github.com/getsentry/sentry-webpack-plugin#options

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

            // Hides source maps from generated client bundles
            hideSourceMaps: true,

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
            // https://github.com/getsentry/sentry-webpack-plugin#options

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

            // Hides source maps from generated client bundles
            hideSourceMaps: true,

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
            // https://github.com/getsentry/sentry-webpack-plugin#options

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

            // Hides source maps from generated client bundles
            hideSourceMaps: true,

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
            // https://github.com/getsentry/sentry-webpack-plugin#options

            org: "my-org",
            project: "my-project",

            // Only print logs for uploading source maps in CI
            silent: !process.env.CI,

            // For all available options, see:
            // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,

            // Automatically add Sentry annotations to React components
            reactComponentAnnotation: {
              enabled: true,
            },

            // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
            // This can increase your server load as well as your hosting bill.
            // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
            // side errors will fail.
            tunnelRoute: "/monitoring",

            // Hides source maps from generated client bundles
            hideSourceMaps: true,

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
