// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { describe, expect, it } from 'vitest';
import { wrapAppWithSentry } from '../../src/remix/codemods/root';

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