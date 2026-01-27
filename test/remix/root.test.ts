// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  wrapAppWithSentry,
  isWithSentryAlreadyUsed,
  instrumentRoot,
  hasSentryMetaTags,
  findMetaExport,
  instrumentMetaFunction,
} from '../../src/remix/codemods/root';

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

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

describe('wrapAppWithSentry', () => {
  it('should wrap the app with Sentry', () => {
    // Empty root.tsx file for testing
    const originalRootAst = parseModule(`
      import { Outlet } from '@remix-run/react';

      export default function App() {
        return <Outlet />;
      }
    `);

    wrapAppWithSentry(originalRootAst, 'root.tsx');

    const result = originalRootAst.generate().code;

    expect(result).toMatchInlineSnapshot(`
      "import {withSentry} from '@sentry/remix';
      import { Outlet } from '@remix-run/react';

      function App() {
        return <Outlet />;
      }

      export default withSentry(App);"
    `);
  });
});

describe('isWithSentryAlreadyUsed', () => {
  it('should return false when withSentry is not used', () => {
    const rootAst = parseModule(`
      import { Outlet } from '@remix-run/react';

      export default function App() {
        return <Outlet />;
      }
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(false);
  });

  it('should return true when withSentry is used in default export', () => {
    const rootAst = parseModule(`
      import { withSentry } from '@sentry/remix';
      import { Outlet } from '@remix-run/react';

      function App() {
        return <Outlet />;
      }

      export default withSentry(App);
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(true);
  });

  it('should return true when withSentry is used in a variable assignment', () => {
    const rootAst = parseModule(`
      import { withSentry } from '@sentry/remix';
      import { Outlet } from '@remix-run/react';

      function App() {
        return <Outlet />;
      }

      const WrappedApp = withSentry(App);
      export default WrappedApp;
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(true);
  });

  it('should return true when withSentry is used inside a function', () => {
    const rootAst = parseModule(`
      import { withSentry } from '@sentry/remix';
      import { Outlet } from '@remix-run/react';

      function App() {
        return <Outlet />;
      }

      function createApp() {
        return withSentry(App);
      }

      export default createApp();
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(true);
  });

  it('should return false when withSentry is imported but not used', () => {
    const rootAst = parseModule(`
      import { withSentry } from '@sentry/remix';
      import { Outlet } from '@remix-run/react';

      export default function App() {
        return <Outlet />;
      }
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(false);
  });

  it('should return false when a different function with similar name is used', () => {
    const rootAst = parseModule(`
      import { Outlet } from '@remix-run/react';

      function withSentryLike() {
        return null;
      }

      export default function App() {
        withSentryLike();
        return <Outlet />;
      }
    `);

    expect(isWithSentryAlreadyUsed(rootAst)).toBe(false);
  });
});

describe('instrumentRoot', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tmpDir = path.join(fixturesDir, 'tmp');

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd() to return the fixtures directory
    vi.spyOn(process, 'cwd').mockReturnValue(fixturesDir);
  });

  afterEach(() => {
    // Clean up any temporary files
    if (fs.existsSync(tmpDir)) {
      try {
        // Remove files first, then directory
        const appDir = path.join(tmpDir, 'app');
        if (fs.existsSync(appDir)) {
          const files = fs.readdirSync(appDir);
          files.forEach((file) => {
            fs.unlinkSync(path.join(appDir, file));
          });
          fs.rmdirSync(appDir);
        }

        const files = fs.readdirSync(tmpDir);
        files.forEach((file) => {
          const filePath = path.join(tmpDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            fs.rmdirSync(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        });
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  it('should add ErrorBoundary and wrap app with Sentry when no ErrorBoundary exists and withSentry is not used', async () => {
    // Copy fixture to tmp directory for testing
    const srcFile = path.join(fixturesDir, 'root-no-error-boundary.tsx');
    const appDir = path.join(tmpDir, 'app');

    // Create app directory and copy file
    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    // Mock process.cwd() to return tmpDir
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    // Check that the file was modified correctly
    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import { captureRemixErrorBoundaryError, withSentry } from "@sentry/remix";',
    );
    expect(modifiedContent).toContain(
      "import { Outlet, useRouteError } from '@remix-run/react';",
    );
    expect(modifiedContent).toContain('withSentry(App)');
    expect(modifiedContent).toContain('const ErrorBoundary = () => {');
  });

  it('should wrap app with Sentry when ErrorBoundary exists but no Sentry content', async () => {
    const srcFile = path.join(fixturesDir, 'root-with-error-boundary.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import { captureRemixErrorBoundaryError, withSentry } from "@sentry/remix";',
    );
    expect(modifiedContent).toContain('withSentry(App)');
  });

  it('should wrap app with Sentry when ErrorBoundary exists with Sentry content but withSentry is not used', async () => {
    const srcFile = path.join(
      fixturesDir,
      'root-with-sentry-error-boundary.tsx',
    );
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      "import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';",
    );
    expect(modifiedContent).toContain('withSentry(App)');
  });

  it('should not wrap app when withSentry is already used', async () => {
    const srcFile = path.join(fixturesDir, 'root-already-wrapped.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Should not add withSentry import or wrap again
    expect(modifiedContent).toContain('withSentry(App)');

    // Count occurrences of withSentry to ensure it's not duplicated
    const withSentryOccurrences = (modifiedContent.match(/withSentry/g) || [])
      .length;
    expect(withSentryOccurrences).toBe(2); // One import, one usage

    // The content should remain largely the same since withSentry is already used
    expect(modifiedContent).toContain('export default withSentry(App)');
  });

  it('should handle ErrorBoundary as variable declaration', async () => {
    const srcFile = path.join(fixturesDir, 'root-variable-error-boundary.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain(
      'import { captureRemixErrorBoundaryError, withSentry } from "@sentry/remix";',
    );
    expect(modifiedContent).toContain('withSentry(App)');
  });
});

describe('hasSentryMetaTags', () => {
  it('should return false when no sentry-trace meta tag exists', () => {
    const rootAst = parseModule(`
      export const meta = () => [
        { title: 'My App' },
      ];
    `);

    expect(hasSentryMetaTags(rootAst)).toBe(false);
  });

  it('should return true when sentry-trace meta tag exists', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { name: 'sentry-trace', content: data && data.sentryTrace },
        { name: 'baggage', content: data && data.sentryBaggage },
        { title: 'My App' },
      ];
    `);

    expect(hasSentryMetaTags(rootAst)).toBe(true);
  });
});

describe('findMetaExport', () => {
  it('should return null when no meta export exists', () => {
    const rootAst = parseModule(`
      export default function App() {
        return <div>Hello</div>;
      }
    `);

    expect(findMetaExport(rootAst)).toBe(null);
  });

  it('should find meta export as arrow function', () => {
    const rootAst = parseModule(`
      export const meta = () => [{ title: 'My App' }];
    `);

    expect(findMetaExport(rootAst)).not.toBe(null);
  });

  it('should find meta export as function declaration', () => {
    const rootAst = parseModule(`
      export function meta() {
        return [{ title: 'My App' }];
      }
    `);

    expect(findMetaExport(rootAst)).not.toBe(null);
  });
});

describe('instrumentMetaFunction', () => {
  it('should add new meta function when none exists', () => {
    const rootAst = parseModule(`
      import { Outlet } from '@remix-run/react';

      export default function App() {
        return <Outlet />;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
    expect(code).toContain('data.sentryTrace');
    expect(code).toContain('data.sentryBaggage');
  });

  it('should modify existing simple meta function to add trace tags', () => {
    const rootAst = parseModule(`
      export const meta = () => [
        { title: 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
    expect(code).toContain("{ title: 'My App' }");
    // Should add data parameter (shorthand syntax)
    expect(code).toMatch(/\{\s*data\s*\}/);
  });

  it('should modify meta function with existing data parameter', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { title: data && data.title || 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
    expect(code).toContain('data.title');
  });

  it('should add data binding when data is aliased (e.g., { data: loaderData })', () => {
    const rootAst = parseModule(`
      export const meta = ({ data: loaderData }) => [
        { title: loaderData?.title || 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
    // Should add a separate data binding since loaderData != data
    expect(code).toContain('data,');
    // Should preserve the original alias
    expect(code).toContain('data: loaderData');
  });

  it('should modify function declaration meta', () => {
    const rootAst = parseModule(`
      export function meta() {
        return [
          { title: 'My App' },
        ];
      }

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
  });

  it('should modify arrow function with block body', () => {
    const rootAst = parseModule(`
      export const meta = () => {
        return [
          { title: 'My App' },
        ];
      };

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
  });

  it('should skip when both sentry-trace and baggage meta tags already exist', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { name: 'sentry-trace', content: data && data.sentryTrace },
        { name: 'baggage', content: data && data.sentryBaggage },
        { title: 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');

    expect(result).toBe(false);
  });

  it('should still modify meta function that uses spread (adds tags at beginning)', () => {
    const rootAst = parseModule(`
      export const meta = ({ matches }) => {
        const parentMeta = matches.flatMap((match) => match.meta ?? []);
        return [...parentMeta, { title: 'My App' }];
      };

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    // Should successfully add sentry tags at the beginning of the array
    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
    expect(code).toContain('baggage');
    // Original spread should still be there
    expect(code).toContain('...parentMeta');
  });

  it('should warn for meta function with conditional return', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => {
        if (data) {
          return [{ title: data.title }];
        }
        return [{ title: 'Fallback' }];
      };

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');

    // Should return false because we can't safely modify multiple return statements
    expect(result).toBe(false);
  });

  it('should return false for meta function with plain identifier param (e.g., args)', () => {
    const rootAst = parseModule(`
      export const meta = (args) => [
        { title: args.data?.title || 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');

    // Should return false because we can't safely add data binding to plain identifier
    // Injecting code that references 'data' would cause a compile error
    expect(result).toBe(false);
  });

  it('should add tags when only sentry-trace exists (missing baggage)', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { name: 'sentry-trace', content: data?.sentryTrace },
        { title: 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    // Should still instrument because baggage is missing (incomplete trace propagation)
    expect(result).toBe(true);
    expect(code).toContain('baggage');
  });

  it('should add tags when only baggage exists (missing sentry-trace)', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { name: 'baggage', content: data?.sentryBaggage },
        { title: 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');
    const code = rootAst.generate().code;

    // Should still instrument because sentry-trace is missing (incomplete trace propagation)
    expect(result).toBe(true);
    expect(code).toContain('sentry-trace');
  });

  it('should skip when both sentry-trace AND baggage exist', () => {
    const rootAst = parseModule(`
      export const meta = ({ data }) => [
        { name: 'sentry-trace', content: data?.sentryTrace },
        { name: 'baggage', content: data?.sentryBaggage },
        { title: 'My App' },
      ];

      export default function App() {
        return <div>Hello</div>;
      }
    `);

    const result = instrumentMetaFunction(rootAst, 'root.tsx');

    // Should skip - both tags already present
    expect(result).toBe(false);
  });
});

describe('instrumentRoot with meta function', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tmpDir = path.join(fixturesDir, 'tmp');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(fixturesDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        const appDir = path.join(tmpDir, 'app');
        if (fs.existsSync(appDir)) {
          const files = fs.readdirSync(appDir);
          files.forEach((file) => {
            fs.unlinkSync(path.join(appDir, file));
          });
          fs.rmdirSync(appDir);
        }
      } catch (_error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  it('should add meta function when instrumenting root without meta', async () => {
    const srcFile = path.join(fixturesDir, 'root-no-meta.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain('sentry-trace');
    expect(modifiedContent).toContain('baggage');
    expect(modifiedContent).toContain('sentryTrace');
    expect(modifiedContent).toContain('sentryBaggage');
  });

  it('should add trace tags to existing simple meta function', async () => {
    const srcFile = path.join(fixturesDir, 'root-with-simple-meta.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    expect(modifiedContent).toContain('sentry-trace');
    expect(modifiedContent).toContain('baggage');
    expect(modifiedContent).toContain("{ title: 'My App' }");
  });

  it('should skip meta function that already has sentry-trace', async () => {
    const srcFile = path.join(fixturesDir, 'root-with-sentry-meta.tsx');
    const appDir = path.join(tmpDir, 'app');

    fs.mkdirSync(appDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(appDir, 'root.tsx'));

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    await instrumentRoot('root.tsx');

    const modifiedContent = fs.readFileSync(
      path.join(appDir, 'root.tsx'),
      'utf8',
    );

    // Count occurrences of sentry-trace to ensure it's not duplicated
    const sentryTraceOccurrences = (
      modifiedContent.match(/sentry-trace/g) || []
    ).length;
    expect(sentryTraceOccurrences).toBe(1);
  });
});
