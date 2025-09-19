import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { instrumentServerEntry } from '../../../src/react-router/codemods/server-entry';

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

describe('instrumentServerEntry', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'server-entry');
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create unique tmp directory for each test
    tmpDir = path.join(
      __dirname,
      'fixtures',
      'tmp',
      `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );
    tmpFile = path.join(tmpDir, 'entry.server.tsx');

    // Ensure tmp directory exists
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up tmp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should add Sentry import and wrap handleRequest function', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentServerEntry(tmpFile);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    // Should add Sentry import
    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );

    // Should wrap the existing handleRequest function
    expect(modifiedContent).toContain(
      'export default Sentry.wrapSentryHandleRequest(handleRequest);',
    );

    // Should add the Sentry import at the top of the file (after existing imports)
    const lines = modifiedContent.split('\n');
    const sentryImportLine = lines.findIndex((line) =>
      line.includes('import * as Sentry from "@sentry/react-router";'),
    );
    expect(sentryImportLine).toBeGreaterThanOrEqual(0);

    // Should create default handleError since none exists
    expect(modifiedContent).toContain(
      'export const handleError = Sentry.createSentryHandleError({',
    );
    expect(modifiedContent).toContain('logErrors: false');
  });

  it('should handle already instrumented server entry without duplication', async () => {
    const alreadyInstrumentedContent = fs.readFileSync(
      path.join(fixturesDir, 'already-instrumented.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, alreadyInstrumentedContent);

    await instrumentServerEntry(tmpFile);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    // Should not add duplicate imports or wrapping since already instrumented
    expect(modifiedContent).toContain(
      "import * as Sentry from '@sentry/react-router';",
    );
    expect(modifiedContent).toContain(
      'export default Sentry.wrapSentryHandleRequest(handleRequest);',
    );

    // Should NOT add a new createSentryHandleError export since handleError already has captureException
    expect(modifiedContent).not.toContain(
      'export const handleError = Sentry.createSentryHandleError({',
    );

    // Should preserve the existing handleError function with captureException
    expect(modifiedContent).toContain('Sentry.captureException(error);');
    expect(modifiedContent).toContain('export { handleError };');
  });

  it('should handle export specifier pattern and preserve existing Sentry calls (bug fix)', async () => {
    const exportSpecifierContent = fs.readFileSync(
      path.join(fixturesDir, 'export-specifier.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, exportSpecifierContent);

    await instrumentServerEntry(tmpFile);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    // Should detect existing Sentry.captureException and not duplicate it
    const captureExceptionCount = (
      modifiedContent.match(/Sentry\.captureException/g) || []
    ).length;
    expect(captureExceptionCount).toBe(1);

    // Should still add import (since Sentry import already exists, it won't duplicate)
    expect(modifiedContent).toContain(
      "import * as Sentry from '@sentry/react-router';",
    );
    expect(modifiedContent).toContain(
      'export default Sentry.wrapSentryHandleRequest(handleRequest);',
    );

    // Should NOT add createSentryHandleError since handleError already has captureException
    expect(modifiedContent).not.toContain(
      'export const handleError = Sentry.createSentryHandleError({',
    );

    // Should preserve existing export specifier pattern
    expect(modifiedContent).toContain('export { handleError };');
  });

  it('should handle variable export pattern with existing export', async () => {
    const variableExportContent = fs.readFileSync(
      path.join(fixturesDir, 'variable-export.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, variableExportContent);

    await instrumentServerEntry(tmpFile);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    // Should add Sentry import and wrap handleRequest
    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain(
      'export default Sentry.wrapSentryHandleRequest(handleRequest);',
    );

    // Should instrument the existing handleError variable with captureException
    expect(modifiedContent).toContain('Sentry.captureException(error);');

    // Should preserve the variable export pattern
    expect(modifiedContent).toContain('export const handleError');
  });
});
