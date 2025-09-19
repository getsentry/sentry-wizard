import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const success = vi.fn();
  const outro = vi.fn();
  const confirm = vi.fn(() => Promise.resolve(false)); // default to false for tests

  return {
    __esModule: true,
    default: {
      log: { info, warn, error, success },
      outro,
      confirm,
    },
  };
});

const { existsSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(
  () => {
    return {
      existsSyncMock: vi.fn(),
      readFileSyncMock: vi.fn(),
      writeFileSyncMock: vi.fn(),
    };
  },
);

vi.mock('fs', async () => {
  return {
    ...(await vi.importActual('fs')),
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  };
});

// module-level mock for child_process.execSync
vi.mock('child_process', () => ({
  __esModule: true,
  execSync: vi.fn(),
}));

// mock showCopyPasteInstructions and makeCodeSnippet used by templates
vi.mock('../../src/utils/clack', () => {
  return {
    __esModule: true,
    showCopyPasteInstructions: vi.fn(() => Promise.resolve()),
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
  isReactRouterV7,
  runReactRouterReveal,
  createServerInstrumentationFile,
} from '../../src/react-router/sdk-setup';
import * as childProcess from 'child_process';
import type { Mock } from 'vitest';
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

  describe('getSentryInitClientContent', () => {
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

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('Sentry.reactRouterTracingIntegration');
      expect(result).toContain('Sentry.replayIntegration');
      expect(result).toContain('replaysSessionSampleRate: 0.1');
      expect(result).toContain('replaysOnErrorSampleRate: 1');
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

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).toContain('Sentry.replayIntegration');
      expect(result).toContain('replaysSessionSampleRate: 0.1');
      expect(result).toContain('replaysOnErrorSampleRate: 1');
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

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('Sentry.reactRouterTracingIntegration');
      expect(result).not.toMatch(/Sentry\.replayIntegration\s*\(/);
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

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('integrations: []');
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

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('Sentry.reactRouterTracingIntegration');
    });
  });

  describe('generateServerInstrumentation', () => {
    it('should generate server instrumentation file with all features enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
    });

    it('should generate server instrumentation file when performance is disabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = false;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).toContain('enableLogs: true');
    });
  });
});

describe('runReactRouterReveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('runs the reveal CLI when entry files are missing', () => {
    // make existsSync (module mock) return false so the function will try to run the CLI
    existsSyncMock.mockReturnValue(false);

    // configure the module-level execSync mock
    (childProcess.execSync as unknown as Mock).mockImplementation(() => 'ok');

    runReactRouterReveal(false);

    expect(childProcess.execSync).toHaveBeenCalledWith(
      'npx react-router reveal',
      {
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
  });

  it('does not run the reveal CLI when entry files already exist', () => {
    existsSyncMock.mockReturnValue(true);

    // ensure execSync mock is reset
    (childProcess.execSync as unknown as Mock).mockReset();

    runReactRouterReveal(true);

    expect(childProcess.execSync).not.toHaveBeenCalled();
  });
});

describe('server instrumentation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('createServerInstrumentationFile writes instrumentation file and returns path', () => {
    // make writeFileSync succeed
    writeFileSyncMock.mockImplementation(() => undefined);

    const path = createServerInstrumentationFile('https://sentry.io/123', {
      performance: true,
      replay: false,
      logs: true,
    });

    expect(path).toContain('instrumentation.server.mjs');
    expect(writeFileSyncMock).toHaveBeenCalled();
    // ensure writeFileSync was called with the instrumentation path and content containing the DSN and tracesSampleRate
    const writtenCall = writeFileSyncMock.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(writtenCall[0]).toEqual(
      expect.stringContaining('instrumentation.server.mjs'),
    );
    expect(writtenCall[1]).toEqual(
      expect.stringContaining('dsn: "https://sentry.io/123"'),
    );
    expect(writtenCall[1]).toEqual(
      expect.stringContaining('tracesSampleRate: 1'),
    );
  });
});
