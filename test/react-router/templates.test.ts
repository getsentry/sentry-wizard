import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock makeCodeSnippet utility
vi.mock('../../src/utils/clack', () => {
  return {
    __esModule: true,
    makeCodeSnippet: vi.fn(
      (
        colors: boolean,
        callback: (
          unchanged: (str: string) => string,
          plus: (str: string) => string,
          minus: (str: string) => string,
        ) => string,
      ) => {
        // Mock implementation that just calls the callback with simple string functions
        const unchanged = (str: string) => str;
        const plus = (str: string) => `+ ${str}`;
        const minus = (str: string) => `- ${str}`;
        return callback(unchanged, plus, minus);
      },
    ),
  };
});

import {
  ERROR_BOUNDARY_TEMPLATE,
  EXAMPLE_PAGE_TEMPLATE_TSX,
  EXAMPLE_PAGE_TEMPLATE_JSX,
  getManualClientEntryContent,
  getManualServerEntryContent,
  getManualRootContent,
  getManualServerInstrumentContent,
  getManualReactRouterConfigContent,
} from '../../src/react-router/templates';

describe('React Router Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Template Constants', () => {
    it('should have correct ERROR_BOUNDARY_TEMPLATE content', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain(
        'function ErrorBoundary({ error })',
      );
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('isRouteErrorResponse(error)');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain(
        'Sentry.captureException(error)',
      );
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('error.status === 404');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('An unexpected error occurred');
    });

    it('should have correct EXAMPLE_PAGE_TEMPLATE_TSX content', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain('import type { Route }');
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'export async function loader()',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'throw new Error("some error thrown in a loader")',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'export default function SentryExamplePage()',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'Loading this page will throw an error',
      );
    });

    it('should have correct EXAMPLE_PAGE_TEMPLATE_JSX content', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).not.toContain('import type { Route }');
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'export async function loader()',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'throw new Error("some error thrown in a loader")',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'export default function SentryExamplePage()',
      );
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'Loading this page will throw an error',
      );
    });
  });

  describe('getManualClientEntryContent', () => {
    it('should generate manual client entry with all features enabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = true;
      const enableReplay = true;
      const enableLogs = true;

      const result = getManualClientEntryContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toContain(
        "+ import * as Sentry from '@sentry/react-router'",
      );
      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('sendDefaultPii: true');
      expect(result).toContain('Sentry.reactRouterTracingIntegration()');
      expect(result).toContain('Sentry.replayIntegration()');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('tracesSampleRate: 1.0');
      expect(result).toContain('replaysSessionSampleRate: 0.1');
      expect(result).toContain('replaysOnErrorSampleRate: 1.0');
      expect(result).toContain('tracePropagationTargets');
      expect(result).toContain('<HydratedRouter />');
    });

    it('should generate manual client entry with tracing disabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = false;
      const enableReplay = true;
      const enableLogs = false;

      const result = getManualClientEntryContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).not.toContain('Sentry.reactRouterTracingIntegration()');
      expect(result).toContain('Sentry.replayIntegration()');
      expect(result).not.toContain('enableLogs: true');
      expect(result).not.toContain('tracePropagationTargets');
    });

    it('should generate manual client entry with replay disabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = true;
      const enableReplay = false;
      const enableLogs = true;

      const result = getManualClientEntryContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('tracesSampleRate: 1.0');
      expect(result).toContain('Sentry.reactRouterTracingIntegration()');
      expect(result).not.toContain('Sentry.replayIntegration()');
      expect(result).toContain('enableLogs: true');
      expect(result).not.toContain('replaysSessionSampleRate');
      expect(result).not.toContain('replaysOnErrorSampleRate');
    });

    it('should generate manual client entry with no integrations', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = false;
      const enableReplay = false;
      const enableLogs = false;

      const result = getManualClientEntryContent(
        dsn,
        enableTracing,
        enableReplay,
        enableLogs,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).not.toContain('Sentry.reactRouterTracingIntegration()');
      expect(result).not.toContain('Sentry.replayIntegration()');
      expect(result).not.toContain('enableLogs: true');
      expect(result).toContain('integrations: [');
    });
  });

  describe('getManualServerEntryContent', () => {
    it('should generate manual server entry content', () => {
      const result = getManualServerEntryContent();

      expect(result).toContain(
        "+ import * as Sentry from '@sentry/react-router'",
      );
      expect(result).toContain('createReadableStreamFromReadable');
      expect(result).toContain('renderToPipeableStream');
      expect(result).toContain('ServerRouter');
      expect(result).toContain(
        '+ const handleRequest = Sentry.createSentryHandleRequest({',
      );
      expect(result).toContain(
        '+ export const handleError = Sentry.createSentryHandleError({',
      );
      expect(result).toContain('logErrors: false');
      expect(result).toContain('export default handleRequest');
      expect(result).toContain('rest of your server entry');
    });
  });

  describe('getManualRootContent', () => {
    it('should generate manual root content for TypeScript', () => {
      const isTs = true;
      const result = getManualRootContent(isTs);

      expect(result).toContain(
        "+ import * as Sentry from '@sentry/react-router'",
      );
      expect(result).toContain(
        'export function ErrorBoundary({ error }: Route.ErrorBoundaryProps)',
      );
      expect(result).toContain('let stack: string | undefined');
      expect(result).toContain('isRouteErrorResponse(error)');
      expect(result).toContain('+ Sentry.captureException(error)');
      expect(result).toContain('details = error.message');
      expect(result).toContain('error.status === 404');
    });

    it('should generate manual root content for JavaScript', () => {
      const isTs = false;
      const result = getManualRootContent(isTs);

      expect(result).toContain(
        "+ import * as Sentry from '@sentry/react-router'",
      );
      expect(result).toContain('export function ErrorBoundary({ error })');
      expect(result).not.toContain(': Route.ErrorBoundaryProps');
      expect(result).toContain('let stack');
      expect(result).not.toContain(': string | undefined');
      expect(result).toContain('isRouteErrorResponse(error)');
      expect(result).toContain('+ Sentry.captureException(error)');
    });
  });

  describe('getManualServerInstrumentContent', () => {
    it('should generate server instrumentation with all features enabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = true;
      const enableProfiling = true;
      const enableLogs = true;

      const result = getManualServerInstrumentContent(
        dsn,
        enableTracing,
        enableProfiling,
        enableLogs,
      );

      expect(result).toContain(
        "+ import * as Sentry from '@sentry/react-router'",
      );
      expect(result).toContain(
        "import { nodeProfilingIntegration } from '@sentry/profiling-node'",
      );
      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('sendDefaultPii: true');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('integrations: [nodeProfilingIntegration()]');
      expect(result).toContain('tracesSampleRate: 1.0');
      expect(result).toContain('profilesSampleRate: 1.0');
      expect(result).toContain('Capture 100% of the transactions');
      expect(result).toContain('profile every transaction');
    });

    it('should generate server instrumentation with tracing disabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = false;
      const enableProfiling = false;

      const result = getManualServerInstrumentContent(
        dsn,
        enableTracing,
        enableProfiling,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).not.toContain('nodeProfilingIntegration');
      expect(result).not.toContain('profilesSampleRate');
      expect(result).not.toContain(
        'integrations: [nodeProfilingIntegration()]',
      );
      // When logs are not enabled, enableLogs should not appear
      expect(result).not.toContain('enableLogs: true');
    });

    it('should generate server instrumentation with profiling disabled but tracing enabled', () => {
      const dsn = 'https://test.sentry.io/123';
      const enableTracing = true;
      const enableProfiling = false;
      const enableLogs = false;

      const result = getManualServerInstrumentContent(
        dsn,
        enableTracing,
        enableProfiling,
        enableLogs,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
      expect(result).toContain('tracesSampleRate: 1.0');
      expect(result).not.toContain('nodeProfilingIntegration');
      expect(result).not.toContain('profilesSampleRate');
      expect(result).not.toContain('integrations:');
    });

    it('should handle special characters in DSN', () => {
      const dsn = 'https://test@example.com/sentry/123?param=value';
      const enableTracing = true;
      const enableProfiling = false;

      const result = getManualServerInstrumentContent(
        dsn,
        enableTracing,
        enableProfiling,
      );

      expect(result).toContain(`dsn: "${dsn}"`);
    });
  });

  describe('getManualReactRouterConfigContent', () => {
    it('should generate TypeScript config snippet with type imports and satisfies', () => {
      const result = getManualReactRouterConfigContent(true);

      expect(result).toContain('import type { Config }');
      expect(result).toContain('} satisfies Config;');
      expect(result).toContain('sentryOnBuildEnd');
      expect(result).toContain('ssr: true');
    });

    it('should generate JavaScript config snippet without TS-only syntax', () => {
      const result = getManualReactRouterConfigContent(false);

      // JS version should NOT have TypeScript-only syntax
      expect(result).not.toContain('import type');
      expect(result).not.toContain('satisfies Config');

      // JS version should have the standard import and export
      expect(result).toContain('import { sentryOnBuildEnd }');
      expect(result).toContain('sentryOnBuildEnd');
      expect(result).toContain('ssr: true');
      expect(result).toContain('export default {');
    });

    it('should default to TypeScript when no parameter is passed', () => {
      const result = getManualReactRouterConfigContent();

      expect(result).toContain('import type { Config }');
      expect(result).toContain('} satisfies Config;');
    });
  });
});
