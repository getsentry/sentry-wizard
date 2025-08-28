import { describe, expect, it } from 'vitest';
import {
  ERROR_BOUNDARY_TEMPLATE,
  EXAMPLE_PAGE_TEMPLATE_TSX,
  EXAMPLE_PAGE_TEMPLATE_JSX,
} from '../../src/react-router/templates';

describe('React Router Templates', () => {
  describe('ERROR_BOUNDARY_TEMPLATE', () => {
    it('should contain proper error boundary structure', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain(
        'export function ErrorBoundary',
      );
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('Route.ErrorBoundaryProps');
    });

    it('should include Sentry error capture', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain(
        'Sentry.captureException(error)',
      );
    });

    it('should handle isRouteErrorResponse check', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('isRouteErrorResponse(error)');
    });

    it('should handle 404 errors specifically', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('error.status === 404');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('404');
    });

    it('should show stack trace in development', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('import.meta.env.DEV');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('error.stack');
    });

    it('should render proper error UI structure', () => {
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('<main>');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('<h1>{message}</h1>');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('<p>{details}</p>');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('<pre>');
      expect(ERROR_BOUNDARY_TEMPLATE).toContain('<code>{stack}</code>');
    });
  });

  describe('EXAMPLE_PAGE_TEMPLATE_TSX', () => {
    it('should contain TypeScript type imports', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain('import type { Route }');
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        './+types/sentry-example-page',
      );
    });

    it('should export async loader function', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'export async function loader()',
      );
    });

    it('should throw error in loader', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'throw new Error("some error thrown in a loader")',
      );
    });

    it('should export default component', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'export default function SentryExamplePage()',
      );
    });

    it('should render informative message', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(
        'Loading this page will throw an error',
      );
    });
  });

  describe('EXAMPLE_PAGE_TEMPLATE_JSX', () => {
    it('should not contain TypeScript type imports', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).not.toContain('import type');
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).not.toContain('./+types/');
    });

    it('should export async loader function', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'export async function loader()',
      );
    });

    it('should throw error in loader', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'throw new Error("some error thrown in a loader")',
      );
    });

    it('should export default component', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'export default function SentryExamplePage()',
      );
    });

    it('should render informative message', () => {
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(
        'Loading this page will throw an error',
      );
    });
  });

  describe('Template differences', () => {
    it('should have different type handling between TSX and JSX templates', () => {
      // TSX should have type imports, JSX should not
      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain('import type');
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).not.toContain('import type');
    });

    it('should have same core functionality in both templates', () => {
      // Both should have the same loader logic
      const loaderPattern = 'export async function loader()';
      const errorPattern = 'throw new Error("some error thrown in a loader")';
      const componentPattern = 'export default function SentryExamplePage()';

      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(loaderPattern);
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(loaderPattern);

      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(errorPattern);
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(errorPattern);

      expect(EXAMPLE_PAGE_TEMPLATE_TSX).toContain(componentPattern);
      expect(EXAMPLE_PAGE_TEMPLATE_JSX).toContain(componentPattern);
    });
  });
});
