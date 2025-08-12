import { describe, expect, it, vi } from 'vitest';
import {
  pubspecOptions,
  sentryProperties,
  initSnippet,
} from '../../src/flutter/templates';

vi.mock('../../src/utils/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined)
}));

describe('Flutter code templates', () => {
  describe('pubspec', () => {
    it('generates pubspec with project and org', () => {
      const template = pubspecOptions('fixture-project', 'fixture-org');
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
      const template = sentryProperties('fixture-token');
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
          replay: true,
          logs: true,
        },
        'const MyApp()',
      );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
              // Adds request headers and IP for users, for more info visit:
              // https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/
              options.sendDefaultPii = true;
              options.enableLogs = true;
              // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
              // We recommend adjusting this value in production.
              options.tracesSampleRate = 1.0;
              // The sampling rate for profiling is relative to tracesSampleRate
              // Setting to 1.0 will profile 100% of sampled transactions:
              options.profilesSampleRate = 1.0;
              // Configure Session Replay
              options.replay.sessionSampleRate = 0.1;
              options.replay.onErrorSampleRate = 1.0;
            },
            appRunner: () => runApp(SentryWidget(child: const MyApp())),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureException(StateError('This is a sample exception.'));"
      `);
    });

    it('generates Sentry config with profiling & replay disabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: true,
          profiling: false,
          replay: false,
          logs: true,
        },
        'const MyApp()',
      );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
              // Adds request headers and IP for users, for more info visit:
              // https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/
              options.sendDefaultPii = true;
              options.enableLogs = true;
              // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
              // We recommend adjusting this value in production.
              options.tracesSampleRate = 1.0;
            },
            appRunner: () => runApp(SentryWidget(child: const MyApp())),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureException(StateError('This is a sample exception.'));"
      `);
    });

    it('generates Sentry config with tracing, profiling, replay and logs disabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: false,
          profiling: false,
          replay: false,
          logs: false,
        },
        'const MyApp()',
      );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
              // Adds request headers and IP for users, for more info visit:
              // https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/
              options.sendDefaultPii = true;
            },
            appRunner: () => runApp(SentryWidget(child: const MyApp())),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureException(StateError('This is a sample exception.'));"
      `);
    });

    it('generates Sentry config with only structured logs enabled', () => {
      const template = initSnippet(
        'my-dsn',
        {
          tracing: false,
          profiling: false,
          replay: false,
          logs: true,
        },
        'const MyApp()',
      );
      expect(template).toMatchInlineSnapshot(`
        "await SentryFlutter.init(
            (options) {
              options.dsn = 'my-dsn';
              // Adds request headers and IP for users, for more info visit:
              // https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/
              options.sendDefaultPii = true;
              options.enableLogs = true;
            },
            appRunner: () => runApp(SentryWidget(child: const MyApp())),
          );
          // TODO: Remove this line after sending the first sample event to sentry.
          await Sentry.captureException(StateError('This is a sample exception.'));"
      `);
    });
  });
});
