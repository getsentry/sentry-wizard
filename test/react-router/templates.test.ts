import { describe, expect, it } from 'vitest';
import {
  ERROR_BOUNDARY_TEMPLATE,
  SENTRY_INIT_CLIENT_CONTENT,
  SENTRY_INIT_SERVER_CONTENT,
  INSTRUMENTATION_SERVER_CONTENT,
} from '../../src/react-router/templates';

describe('React Router Templates', () => {
  describe('ERROR_BOUNDARY_TEMPLATE', () => {
    it('should generate error boundary template with Sentry integration', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toMatchInlineSnapshot(`
        "export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
          let message = "Oops!";
          let details = "An unexpected error occurred.";
          let stack: string | undefined;

          if (isRouteErrorResponse(error)) {
            message = error.status === 404 ? "404" : "Error";
            details =
              error.status === 404
                ? "The requested page could not be found."
                : error.statusText || details;
          } else if (error && error instanceof Error) {
            // you only want to capture non 404-errors that reach the boundary
            Sentry.captureException(error);
            if (import.meta.env.DEV) {
              details = error.message;
              stack = error.stack;
            }
          }

          return (
            <main>
              <h1>{message}</h1>
              <p>{details}</p>
              {stack && (
                <pre>
                  <code>{stack}</code>
                </pre>
              )}
            </main>
          );
        }"
      `);
    });
  });

  describe('SENTRY_INIT_CLIENT_CONTENT', () => {
    it('should generate client initialization content with all features enabled', () => {
      const content = SENTRY_INIT_CLIENT_CONTENT(
        'https://test.sentry.io/123',
        true,
        true,
        true,
      );

      expect(content).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://test.sentry.io/123",
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

    it('should generate client initialization content with performance only', () => {
      const content = SENTRY_INIT_CLIENT_CONTENT(
        'https://test.sentry.io/123',
        true,
        false,
        false,
      );

      expect(content).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://test.sentry.io/123",
            tracesSampleRate: 1,

            integrations: [browserTracingIntegration({
              useEffect,
              useLocation,
              useNavigate
            })],
        });"
      `);
    });

    it('should generate client initialization content with replay only', () => {
      const content = SENTRY_INIT_CLIENT_CONTENT(
        'https://test.sentry.io/123',
        false,
        true,
        false,
      );

      expect(content).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://test.sentry.io/123",
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

    it('should generate minimal client initialization content', () => {
      const content = SENTRY_INIT_CLIENT_CONTENT(
        'https://test.sentry.io/123',
        false,
        false,
        false,
      );

      expect(content).toMatchInlineSnapshot(`
        "import { init, replayIntegration, browserTracingIntegration } from "@sentry/react-router";
        import { useEffect } from "react";
        import { useLocation, useNavigate } from "react-router";

        init({
            dsn: "https://test.sentry.io/123",
            tracesSampleRate: 0,

            integrations: [],
        });"
      `);
    });
  });

  describe('SENTRY_INIT_SERVER_CONTENT', () => {
    it('should generate server initialization content', () => {
      const content = SENTRY_INIT_SERVER_CONTENT();

      expect(content).toMatchInlineSnapshot(`
        "import * as Sentry from "@sentry/react-router";
        import { type HandleErrorFunction } from "react-router";

        export const handleError: HandleErrorFunction = (error, { request }) => {
          // React Router may abort some interrupted requests, report those
          if (!request.signal.aborted) {
            Sentry.captureException(error);
            console.error(error);
          }
        };"
      `);
    });
  });

  describe('INSTRUMENTATION_SERVER_CONTENT', () => {
    it('should generate server instrumentation content with performance enabled', () => {
      const content = INSTRUMENTATION_SERVER_CONTENT(
        'https://test.sentry.io/123',
        true,
      );

      expect(content).toMatchInlineSnapshot(`
        "import * as Sentry from "@sentry/react-router";

        Sentry.init({
            dsn: "https://test.sentry.io/123",
            tracesSampleRate: 1,
            enableLogs: true
        });"
      `);
    });

    it('should generate server instrumentation content with performance disabled', () => {
      const content = INSTRUMENTATION_SERVER_CONTENT(
        'https://test.sentry.io/123',
        false,
      );

      expect(content).toMatchInlineSnapshot(`
        "import * as Sentry from "@sentry/react-router";

        Sentry.init({
            dsn: "https://test.sentry.io/123",
            tracesSampleRate: 0,
            enableLogs: true
        });"
      `);
    });
  });
});
