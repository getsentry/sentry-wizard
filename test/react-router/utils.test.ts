// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { describe, expect, it } from 'vitest';
import {
  getAfterImportsInsertionIndex,
  hasSentryContent,
  serverHasInstrumentationImport,
} from '../../src/react-router/utils';

describe('React Router Utils', () => {
  describe('getAfterImportsInsertionIndex', () => {
    it('should return 0 for empty module', () => {
      const mod = parseModule('');
      expect(getAfterImportsInsertionIndex(mod)).toBe(0);
    });

    it('should return index after last import', () => {
      const mod = parseModule(`
        import React from 'react';
        import { useState } from 'react';
        import { useRouter } from 'react-router';

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(getAfterImportsInsertionIndex(mod)).toBe(3);
    });

    it('should return 0 when no imports exist', () => {
      const mod = parseModule(`
        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(getAfterImportsInsertionIndex(mod)).toBe(0);
    });

    it('should handle mixed imports and statements', () => {
      const mod = parseModule(`
        import React from 'react';
        import { useState } from 'react';

        const config = {};

        import { useRouter } from 'react-router';

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      // Should only count consecutive imports from the beginning
      expect(getAfterImportsInsertionIndex(mod)).toBe(2);
    });
  });

  describe('hasSentryContent', () => {
    it('should return false for module without Sentry content', () => {
      const mod = parseModule(`
        import React from 'react';

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(hasSentryContent(mod)).toBe(false);
    });

    it('should return true for module with @sentry/react-router import', () => {
      const mod = parseModule(`
        import React from 'react';
        import * as Sentry from '@sentry/react-router';

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(hasSentryContent(mod)).toBe(true);
    });

    it('should return true for module with Sentry.init call', () => {
      const mod = parseModule(`
        import React from 'react';

        Sentry.init({
          dsn: 'test-dsn'
        });

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(hasSentryContent(mod)).toBe(true);
    });

    it('should return false for similar but non-Sentry content', () => {
      const mod = parseModule(`
        import React from 'react';
        import { sentry } from './utils'; // lowercase sentry

        export default function App() {
          return <div>Hello</div>;
        }
      `);
      expect(hasSentryContent(mod)).toBe(false);
    });
  });

  describe('serverHasInstrumentationImport', () => {
    it('should return false for module without instrumentation import', () => {
      const mod = parseModule(`
        import { createRequestHandler } from '@react-router/node';

        export default createRequestHandler();
      `);
      expect(serverHasInstrumentationImport(mod)).toBe(false);
    });

    it('should return true for module with ./instrument.server import', () => {
      const mod = parseModule(`
        import './instrument.server';
        import { createRequestHandler } from '@react-router/node';

        export default createRequestHandler();
      `);
      expect(serverHasInstrumentationImport(mod)).toBe(true);
    });

    it('should return true for module with instrument.server import', () => {
      const mod = parseModule(`
        import 'instrument.server';
        import { createRequestHandler } from '@react-router/node';

        export default createRequestHandler();
      `);
      expect(serverHasInstrumentationImport(mod)).toBe(true);
    });

    it('should return false for similar but different imports', () => {
      const mod = parseModule(`
        import './instrumentation';
        import { createRequestHandler } from '@react-router/node';

        export default createRequestHandler();
      `);
      expect(serverHasInstrumentationImport(mod)).toBe(false);
    });
  });
});
