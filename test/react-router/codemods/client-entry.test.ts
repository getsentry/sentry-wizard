import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { instrumentClientEntry } from '../../../src/react-router/codemods/client.entry';

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

describe('instrumentClientEntry', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'client-entry');
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create unique tmp directory for each test
    tmpDir = path.join(
      fixturesDir,
      'tmp',
      `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    );
    tmpFile = path.join(tmpDir, 'entry.client.tsx');

    // Ensure tmp directory exists
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up tmp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should add Sentry import and initialization with all features enabled', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', true, true, true);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('dsn: "test-dsn"');
    expect(modifiedContent).toContain('integrations: [');
    expect(modifiedContent).toContain('Sentry.reactRouterTracingIntegration()');
    expect(modifiedContent).toContain('Sentry.replayIntegration(');
    expect(modifiedContent).toContain('enableLogs: true');
  });

  it('should add Sentry initialization with only tracing enabled', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', true, false, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('dsn: "test-dsn"');
    expect(modifiedContent).toContain('integrations: [');
    expect(modifiedContent).toContain('Sentry.reactRouterTracingIntegration()');
    expect(modifiedContent).not.toContain('Sentry.replayIntegration()');
    expect(modifiedContent).not.toContain('enableLogs: true');
  });

  it('should add Sentry initialization with only replay enabled', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', false, true, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('dsn: "test-dsn"');
    expect(modifiedContent).toContain('integrations: [');
    expect(modifiedContent).not.toContain(
      'Sentry.reactRouterTracingIntegration()',
    );
    expect(modifiedContent).toContain('Sentry.replayIntegration(');
    expect(modifiedContent).not.toContain('enableLogs: true');
  });

  it('should add Sentry initialization with only logs enabled', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', false, false, true);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('dsn: "test-dsn"');
    expect(modifiedContent).toContain('integrations: [');
    expect(modifiedContent).not.toContain(
      'Sentry.reactRouterTracingIntegration()',
    );
    expect(modifiedContent).not.toContain('Sentry.replayIntegration()');
    expect(modifiedContent).toContain('enableLogs: true');
  });

  it('should add minimal Sentry initialization when all features are disabled', async () => {
    const basicContent = fs.readFileSync(
      path.join(fixturesDir, 'basic.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, basicContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', false, false, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('dsn: "test-dsn"');
    expect(modifiedContent).toContain('integrations: []');
    expect(modifiedContent).not.toContain(
      'Sentry.reactRouterTracingIntegration()',
    );
    expect(modifiedContent).not.toContain('Sentry.replayIntegration()');
    expect(modifiedContent).not.toContain('enableLogs: true');
  });

  it('should not modify file when Sentry content already exists', async () => {
    const withSentryContent = fs.readFileSync(
      path.join(fixturesDir, 'with-sentry.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, withSentryContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', true, true, true);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    // Content should remain unchanged
    expect(modifiedContent).toBe(withSentryContent);
  });

  it('should insert Sentry initialization after imports', async () => {
    const withImportsContent = fs.readFileSync(
      path.join(fixturesDir, 'with-imports.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, withImportsContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', true, false, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');

    // Check that the Sentry import is before the init call
    const sentryImportIndex = modifiedContent.indexOf(
      'import * as Sentry from "@sentry/react-router";',
    );
    const sentryInitIndex = modifiedContent.indexOf('Sentry.init({');
    expect(sentryImportIndex).toBeLessThan(sentryInitIndex);
  });

  it('should handle files with no imports', async () => {
    const noImportsContent = fs.readFileSync(
      path.join(fixturesDir, 'no-imports.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, noImportsContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', false, true, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');
    expect(modifiedContent).toContain('Sentry.replayIntegration(');
  });

  it('should preserve existing code structure', async () => {
    const complexContent = fs.readFileSync(
      path.join(fixturesDir, 'complex.tsx'),
      'utf8',
    );

    fs.writeFileSync(tmpFile, complexContent);

    await instrumentClientEntry(tmpFile, 'test-dsn', true, true, false);

    const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

    expect(modifiedContent).toContain(
      'import * as Sentry from "@sentry/react-router";',
    );
    expect(modifiedContent).toContain('Sentry.init({');

    // Original content should still be there
    expect(modifiedContent).toContain('startTransition');
    expect(modifiedContent).toContain('hydrateRoot');
    expect(modifiedContent).toContain('<StrictMode>');
  });

  describe('Instrumentation API', () => {
    it('should add tracing variable and unstable_instrumentations prop when useInstrumentationAPI is true', async () => {
      const basicContent = fs.readFileSync(
        path.join(fixturesDir, 'basic.tsx'),
        'utf8',
      );

      fs.writeFileSync(tmpFile, basicContent);

      await instrumentClientEntry(
        tmpFile,
        'test-dsn',
        true,
        false,
        false,
        true,
      );

      const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

      // Should have the tracing variable
      expect(modifiedContent).toContain(
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
      );

      // Should pass tracing to integrations
      expect(modifiedContent).toContain('integrations: [tracing]');

      // Should add unstable_instrumentations prop to HydratedRouter
      expect(modifiedContent).toContain(
        'unstable_instrumentations={[tracing.clientInstrumentation]}',
      );
    });

    it('should add tracing variable with replay integration when both are enabled', async () => {
      const basicContent = fs.readFileSync(
        path.join(fixturesDir, 'basic.tsx'),
        'utf8',
      );

      fs.writeFileSync(tmpFile, basicContent);

      await instrumentClientEntry(tmpFile, 'test-dsn', true, true, false, true);

      const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

      // Should have the tracing variable
      expect(modifiedContent).toContain(
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
      );

      // Should pass both tracing and replay to integrations
      expect(modifiedContent).toContain(
        'integrations: [tracing, Sentry.replayIntegration()]',
      );

      // Should add unstable_instrumentations prop to HydratedRouter
      expect(modifiedContent).toContain(
        'unstable_instrumentations={[tracing.clientInstrumentation]}',
      );
    });

    it('should not use instrumentation API when tracing is disabled', async () => {
      const basicContent = fs.readFileSync(
        path.join(fixturesDir, 'basic.tsx'),
        'utf8',
      );

      fs.writeFileSync(tmpFile, basicContent);

      // useInstrumentationAPI is true but tracing is disabled
      await instrumentClientEntry(
        tmpFile,
        'test-dsn',
        false,
        true,
        false,
        true,
      );

      const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

      // Should NOT have the tracing variable (instrumentation API requires tracing)
      expect(modifiedContent).not.toContain(
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
      );

      // Should NOT add unstable_instrumentations prop
      expect(modifiedContent).not.toContain('unstable_instrumentations');
    });

    it('should not use instrumentation API when useInstrumentationAPI is false', async () => {
      const basicContent = fs.readFileSync(
        path.join(fixturesDir, 'basic.tsx'),
        'utf8',
      );

      fs.writeFileSync(tmpFile, basicContent);

      await instrumentClientEntry(
        tmpFile,
        'test-dsn',
        true,
        false,
        false,
        false,
      );

      const modifiedContent = fs.readFileSync(tmpFile, 'utf8');

      // Should NOT have the tracing variable
      expect(modifiedContent).not.toContain(
        'const tracing = Sentry.reactRouterTracingIntegration({ useInstrumentationAPI: true });',
      );

      // Should have regular tracing integration call
      expect(modifiedContent).toContain(
        'Sentry.reactRouterTracingIntegration()',
      );

      // Should NOT add unstable_instrumentations prop
      expect(modifiedContent).not.toContain('unstable_instrumentations');
    });
  });
});
