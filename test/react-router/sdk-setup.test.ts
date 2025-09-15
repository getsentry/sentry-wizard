import { describe, expect, it, vi, beforeEach } from 'vitest';

// minimal clack mock: only stub the methods used by sdk-setup
vi.mock('@clack/prompts', () => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const success = vi.fn();
  const outro = vi.fn();

  return {
    __esModule: true,
    default: {
      log: { info, warn, error, success },
      outro,
    },
  };
});

// hoisted mocks for fs methods (pattern copied from angular tests)
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

// mock showCopyPasteInstructions used by initializeSentryOnEntryClient
vi.mock('../../src/utils/clack', () => {
  return {
    __esModule: true,
    showCopyPasteInstructions: vi.fn(() => Promise.resolve()),
  };
});

import {
  isReactRouterV7,
  runReactRouterReveal,
  createServerInstrumentationFile,
  insertServerInstrumentationFile,
  instrumentSentryOnEntryServer,
  initializeSentryOnEntryClient,
} from '../../src/react-router/sdk-setup';
import { showCopyPasteInstructions } from '../../src/utils/clack';
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

      expect(result).toContain(
        'import { init, replayIntegration, reactRouterTracingIntegration } from "@sentry/react-router"',
      );
      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('reactRouterTracingIntegration');
      expect(result).toContain('replayIntegration');
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

      expect(result).toContain(
        'import { init, replayIntegration } from "@sentry/react-router"',
      );
      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 0');
      expect(result).toContain('replayIntegration');
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

      expect(result).toContain(
        'import { init, reactRouterTracingIntegration } from "@sentry/react-router"',
      );
      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('reactRouterTracingIntegration');
      expect(result).not.toMatch(/replayIntegration\s*\(/);
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

      expect(result).toContain('import { init } from "@sentry/react-router"');
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

      expect(result).toContain(
        'import { init, reactRouterTracingIntegration } from "@sentry/react-router"',
      );
      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
      expect(result).toContain('reactRouterTracingIntegration');
    });
  });

  describe('generateServerInstrumentation', () => {
    it('should generate server instrumentation file with all features enabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = true;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toContain(
        'import * as Sentry from "@sentry/react-router"',
      );
      expect(result).toContain('dsn: "https://sentry.io/123"');
      expect(result).toContain('tracesSampleRate: 1');
      expect(result).toContain('enableLogs: true');
    });

    it('should generate server instrumentation file when performance is disabled', () => {
      const dsn = 'https://sentry.io/123';
      const enableTracing = false;

      const result = getSentryInstrumentationServerContent(dsn, enableTracing);

      expect(result).toContain(
        'import * as Sentry from "@sentry/react-router"',
      );
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

  it('insertServerInstrumentationFile inserts import into server file when present', () => {
    // server.mjs exists and has content without instrumentation import
    existsSyncMock.mockImplementation((p: string) => p.endsWith('server.mjs'));
    readFileSyncMock.mockImplementation(() => 'console.log("server")');
    writeFileSyncMock.mockImplementation(() => undefined);

    const result = insertServerInstrumentationFile();

    expect(result).toBe(true);
    expect(writeFileSyncMock).toHaveBeenCalled();
    // verify the server file was updated to include the instrumentation import
    const serverCall = writeFileSyncMock.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(serverCall[0]).toEqual(expect.stringContaining('server.mjs'));
    expect(serverCall[1]).toEqual(
      expect.stringContaining("import './instrumentation.server.mjs'"),
    );
  });

  it('instrumentSentryOnEntryServer prepends Sentry init to server entry when file exists', async () => {
    const serverContent = 'export function handleRequest() {}';
    existsSyncMock.mockImplementation((p: string) =>
      p.includes('entry.server'),
    );
    readFileSyncMock.mockImplementation(() => serverContent);
    writeFileSyncMock.mockImplementation(() => undefined);

    await instrumentSentryOnEntryServer(true);

    expect(readFileSyncMock).toHaveBeenCalled();
    expect(writeFileSyncMock).toHaveBeenCalled();
    // verify the server entry file was written with Sentry import and handleError export
    const entryCall = writeFileSyncMock.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(entryCall[0]).toEqual(expect.stringContaining('entry.server'));
    expect(entryCall[1]).toEqual(
      expect.stringContaining('import * as Sentry from "@sentry/react-router"'),
    );
    expect(entryCall[1]).toEqual(expect.stringContaining('handleError'));
  });
});

describe('initializeSentryOnEntryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('skips when client entry does not exist', async () => {
    existsSyncMock.mockReturnValue(false);

    await initializeSentryOnEntryClient(
      'https://sentry.io/123',
      true,
      false,
      true,
      false,
    );

    // should not attempt to read or write
    expect(readFileSyncMock).not.toHaveBeenCalled();
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('reads and writes client entry when file exists', async () => {
    const original = 'console.log("client entry");';
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(original);
    writeFileSyncMock.mockImplementation(() => undefined);

    await initializeSentryOnEntryClient(
      'https://sentry.io/123',
      true,
      true,
      true,
      false,
    );

    expect(readFileSyncMock).toHaveBeenCalled();
    expect(writeFileSyncMock).toHaveBeenCalled();

    const written = writeFileSyncMock.mock.calls[0] as unknown as [
      string,
      string,
    ];
    // verify the path and content written to the client entry file
    expect(written[0]).toEqual(expect.stringContaining('entry.client.jsx'));
    expect(written[1]).toContain('dsn: "https://sentry.io/123"');
    expect(written[1]).toContain('import { init');
  });

  it('on write failure falls back to showCopyPasteInstructions', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('console.log("client entry");');
    writeFileSyncMock.mockImplementation(() => {
      throw new Error('disk full');
    });

    await initializeSentryOnEntryClient(
      'https://sentry.io/123',
      false,
      false,
      false,
      false,
    );

    expect(showCopyPasteInstructions).toHaveBeenCalled();
    // verify fallback helper was invoked with expected filename and a code snippet containing the DSN
    const calledArgs = (showCopyPasteInstructions as unknown as Mock).mock
      .calls[0] as unknown as [
      {
        filename: string;
        codeSnippet: string;
        hint?: string;
      },
    ];
    const options = calledArgs[0];
    expect(options.filename).toEqual(
      expect.stringContaining('entry.client.jsx'),
    );
    expect(options.codeSnippet).toContain('dsn: "https://sentry.io/123"');
  });
});
