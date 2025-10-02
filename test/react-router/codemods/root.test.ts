import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { instrumentRoot } from '../../../src/react-router/codemods/root';

vi.mock('@clack/prompts', () => {
  const mock = {
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    },
  };
  return {
    default: mock,
    ...mock,
  };
});

vi.mock('../../../src/utils/debug', () => ({
  debug: vi.fn(),
}));

describe('instrumentRoot', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'root');
  let tmpDir: string;
  let appDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create unique tmp directory for each test
    tmpDir = path.join(
      fixturesDir,
      'tmp',
      `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );
    appDir = path.join(tmpDir, 'app');

    // Ensure tmp and app directories exist
    fs.mkdirSync(appDir, { recursive: true });

    // Mock process.cwd() to return the tmp directory
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    // Clean up tmp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    vi.restoreAllMocks();
  });

  it('should add ErrorBoundary when no ErrorBoundary exists and no Sentry content', async () => {
    // Copy fixture to tmp directory for testing
    const srcFile = path.join(fixturesDir, 'no-error-boundary.tsx');

    // Create app directory and copy file
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    // Mock process.cwd() to return tmpDir

    await instrumentRoot('root.tsx');

    // Check that the file was modified correctly
    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain(
      "import { Outlet, isRouteErrorResponse } from 'react-router';",
    );
    expect(modifiedContent).toContain(
      'export function ErrorBoundary({ error })',
    );
    expect(modifiedContent).toContain('Sentry.captureException(error);');
    expect(modifiedContent).toContain('if (isRouteErrorResponse(error))');
  });

  it('should add Sentry.captureException to existing function declaration ErrorBoundary', async () => {
    const srcFile = path.join(fixturesDir, 'with-function-error-boundary.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.captureException(error);');
  });

  it('should add Sentry.captureException to existing variable declaration ErrorBoundary', async () => {
    const srcFile = path.join(fixturesDir, 'with-variable-error-boundary.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    // Now properly handles variable declaration ErrorBoundary
    expect(modifiedContent).toContain('Sentry.captureException(error);');
  });

  it('should not modify file when ErrorBoundary already has Sentry.captureException', async () => {
    const srcFile = path.join(fixturesDir, 'with-sentry-error-boundary.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not add duplicate Sentry.captureException
    const captureExceptionOccurrences = (
      modifiedContent.match(/Sentry\.captureException/g) || []
    ).length;
    expect(captureExceptionOccurrences).toBe(1);
  });

  it('should not add Sentry import when Sentry content already exists', async () => {
    const srcFile = path.join(fixturesDir, 'with-existing-sentry.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not duplicate Sentry imports
    const sentryImportOccurrences = (
      modifiedContent.match(/import.*@sentry\/react-router/g) || []
    ).length;
    expect(sentryImportOccurrences).toBe(1);
  });

  it('should add isRouteErrorResponse import when not present and ErrorBoundary is added', async () => {
    const srcFile = path.join(fixturesDir, 'no-isrouteerrorresponse.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      "import { Outlet, isRouteErrorResponse } from 'react-router';",
    );
    expect(modifiedContent).toContain(
      'export function ErrorBoundary({ error })',
    );
  });

  it('should not add duplicate isRouteErrorResponse import when already present', async () => {
    const srcFile = path.join(fixturesDir, 'with-isrouteerrorresponse.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not duplicate isRouteErrorResponse imports
    const isRouteErrorResponseOccurrences = (
      modifiedContent.match(/isRouteErrorResponse/g) || []
    ).length;
    expect(isRouteErrorResponseOccurrences).toBe(3); // One import, two usages in template
  });

  it('should handle ErrorBoundary with alternative function declaration syntax', async () => {
    const srcFile = path.join(
      fixturesDir,
      'function-expression-error-boundary.tsx',
    );

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.captureException(error);');
  });

  it('should handle function declaration with separate export', async () => {
    const srcFile = path.join(
      fixturesDir,
      'function-declaration-separate-export.tsx',
    );

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.captureException(error);');

    // Should preserve function declaration syntax
    expect(modifiedContent).toMatch(/function ErrorBoundary\(/);
    expect(modifiedContent).toContain('export { ErrorBoundary }');
  });

  it('should handle ErrorBoundary with captureException imported directly', async () => {
    const srcFile = path.join(fixturesDir, 'with-direct-capture-exception.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not add duplicate captureException calls
    const captureExceptionOccurrences = (
      modifiedContent.match(/captureException/g) || []
    ).length;
    expect(captureExceptionOccurrences).toBe(2); // One import, one usage
  });

  it('should not modify an already properly configured file', async () => {
    const srcFile = path.join(fixturesDir, 'fully-configured.tsx');

    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not add duplicate imports or modify existing Sentry configuration
    const sentryImportOccurrences = (
      modifiedContent.match(/import.*@sentry\/react-router/g) || []
    ).length;
    expect(sentryImportOccurrences).toBe(1);

    const captureExceptionOccurrences = (
      modifiedContent.match(/Sentry\.captureException/g) || []
    ).length;
    expect(captureExceptionOccurrences).toBe(1);

    const errorBoundaryOccurrences = (
      modifiedContent.match(/export function ErrorBoundary/g) || []
    ).length;
    expect(errorBoundaryOccurrences).toBe(1);

    expect(modifiedContent).toContain(
      "import * as Sentry from '@sentry/react-router';",
    );
    expect(modifiedContent).toContain(
      "import { Outlet, isRouteErrorResponse } from 'react-router';",
    );
  });
});
