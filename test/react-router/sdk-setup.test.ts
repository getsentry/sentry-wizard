import { describe, expect, it } from 'vitest';
import { isReactRouterV7 } from '../../src/react-router/sdk-setup';
import {
  getSentryInitClientContent,
  getSentryInstrumentationServerContent,
} from '../../src/react-router/templates';

describe('React Router SDK Setup', () => {
  describe('isReactRouterV7', () => {
    it('should return true for React Router v7', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '7.0.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });

    it('should return false for React Router v6', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '6.28.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should return false when no React Router dependency', () => {
      const packageJson = {
        dependencies: {
          react: '^18.0.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should handle version ranges gracefully', () => {
      const packageJson = {
        dependencies: {
          '@react-router/dev': '^7.1.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });

    it('should handle empty package.json', () => {
      const packageJson = {};

      expect(isReactRouterV7(packageJson)).toBe(false);
    });

    it('should check devDependencies if not in dependencies', () => {
      const packageJson = {
        devDependencies: {
          '@react-router/dev': '7.1.0',
        },
      };

      expect(isReactRouterV7(packageJson)).toBe(true);
    });
  });

  describe('initializeSentryOnClient (template content)', () => {
    it('should generate client initialization with all features enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;
      const enableReplay = true;
      const enableLogs = true;

      const result = getSentryInitClientContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 1,
            enableLogs: true,

            integrations: [browserTracingIntegration({
              useEffect,
              useLocation,
              useNavigate
            }), replayIntegration({
                maskAllText: true,
                blockAllMedia: true
            })],

            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1
        });"
      `);
    });

    it('should generate client initialization when performance disabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = false;
      const enableReplay = true;
      const enableLogs = false;

      const result = getSentryInitClientContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 0,

            integrations: [replayIntegration({
                maskAllText: true,
                blockAllMedia: true
            })],

            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1
        });"
      `);
    });

    it('should generate client initialization when replay disabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;
      const enableReplay = false;
      const enableLogs = false;

      const result = getSentryInitClientContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 1,

            integrations: [browserTracingIntegration({
              useEffect,
              useLocation,
              useNavigate
            })],
        });"
      `);
    });

    it('should generate client initialization with only logs enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = false;
      const enableReplay = false;
      const enableLogs = true;

      const result = getSentryInitClientContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 0,
            enableLogs: true,

            integrations: [],
        });"
      `);
    });

    it('should generate client initialization with performance and logs enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;
      const enableReplay = false;
      const enableLogs = true;

      const result = getSentryInitClientContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 1,
            enableLogs: true,

            integrations: [browserTracingIntegration({
              useEffect,
              useLocation,
              useNavigate
            })],
        });"
      `);
    });
  });

  describe('generateServerInstrumentation (template content)', () => {
    it('should generate server instrumentation file with all features enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toMatchInlineSnapshot(`
        "import * as Sentry from "@sentry/react-router";

        Sentry.init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 1,
            enableLogs: true
        });"
      `);
    });

    it('should generate server instrumentation file when performance is disabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = false;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toMatchInlineSnapshot(`
        "import * as Sentry from "@sentry/react-router";

        Sentry.init({
            dsn: "https://sentry.io/123",
            tracesSampleRate: 0,
            enableLogs: true
        });"
      `);
    });
  });
});
