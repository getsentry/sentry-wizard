// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { describe, expect, it } from 'vitest';
import {
  wrapAppWithSentry,
  isWithSentryAlreadyUsed,
} from '../../src/remix/codemods/root';

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
