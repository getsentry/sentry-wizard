import {
  pubspecOptions,
  sentryProperties,
  initSnippet,
} from '../../src/flutter/templates';

describe('Flutter code templates', () => {
  describe('pubspec', () => {
    it('generates pubspec with project and org', () => {
      const template = pubspecOptions(
        'fixture-project',
        'fixture-org',
      );
      expect(template).toMatchInlineSnapshot(`
      "sentry:
        upload_debug_symbols: true
        upload_source_maps: true
        project: fixture-project
        org: fixture-org
      "
      `);
    });
  });
  describe('sentry.properties', () => {
    it('generates sentry.properties with token', () => {
      const template = sentryProperties(
        'fixture-token',
      );
      expect(template).toMatchInlineSnapshot(`"auth_token=fixture-token"`);
    });
  });
  describe('init', () => {
    it('generates Sentry config with all features enabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: true,
          profiling: true,
        },
        'const MyApp()',
        );
      expect(template).toMatchInlineSnapshot(`
      "await SentryFlutter.init(
          (options) {
            options.dsn = 'my-dsn';
            // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
            // We recommend adjusting this value in production.
            options.tracesSampleRate = 1.0;
            // The sampling rate for profiling is relative to tracesSampleRate
            // Setting to 1.0 will profile 100% of sampled transactions:
            options.profilesSampleRate = 1.0;
          },
          appRunner: () => runApp(const MyApp()),
        );
        // TODO: Remove this line after sending the first sample event to sentry.
        await Sentry.captureMessage('This is a sample exception.');"
      `);
    });

    it('generates Sentry config with profiling disabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: true,
          profiling: false,
        },
        'const MyApp()',
        );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
              // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
              // We recommend adjusting this value in production.
              options.tracesSampleRate = 1.0;
            },
            appRunner: () => runApp(const MyApp()),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureMessage('This is a sample exception.');"
      `);
    });

    it('generates Sentry config with tracing disabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: false,
          profiling: false,
        },
        'const MyApp()',
        );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
            },
            appRunner: () => runApp(const MyApp()),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureMessage('This is a sample exception.');"
      `);
    });
  });
});
