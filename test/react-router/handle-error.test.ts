// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import { describe, expect, it } from 'vitest';
import { instrumentHandleError } from '../../src/react-router/codemods/handle-error';

describe('React Router Handle Error Codemod', () => {
  describe('instrumentHandleError', () => {
    it('should add Sentry handle request and error functions to empty server entry', () => {
      const entryServerAst = parseModule('');

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toContain(
        'import {  createReadableStreamFromReadable,} from "@react-router/node"',
      );
      expect(result).toContain(
        'import {  renderToPipeableStream,} from "react-dom/server"',
      );
      expect(result).toContain('import {  ServerRouter,} from "react-router"');
      expect(result).toContain(
        'const handleRequest = Sentry.createSentryHandleRequest',
      );
      expect(result).toContain(
        'export const handleError = Sentry.createSentryHandleError',
      );
    });

    it('should add Sentry functions to server entry with existing imports', () => {
      const entryServerAst = parseModule(`
        import { createRequestHandler } from '@react-router/node';
        import express from 'express';

        const app = express();
      `);

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toContain(
        'import {createRequestHandler, createReadableStreamFromReadable} from \'@react-router/node\'',
      );
      expect(result).toContain('import express from \'express\'');
      expect(result).toContain(
        'import {renderToPipeableStream} from \'react-dom/server\'',
      );
      expect(result).toContain('import {ServerRouter} from \'react-router\'');
      expect(result).toContain(
        'const handleRequest = Sentry.createSentryHandleRequest',
      );
      expect(result).toContain(
        'export const handleError = Sentry.createSentryHandleError',
      );
    });

    it('should replace existing default export with handleRequest', () => {
      const entryServerAst = parseModule(`
        import { createRequestHandler } from '@react-router/node';

        const handler = createRequestHandler({
          build: require('./build'),
        });

        export default handler;
      `);

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toContain('export default handleRequest');
      expect(result).not.toContain('export default handler');
    });

    it('should handle server entry with function default export', () => {
      const entryServerAst = parseModule(`
        import { createRequestHandler } from '@react-router/node';

        export default function handler(request, response) {
          return createRequestHandler({
            build: require('./build'),
          })(request, response);
        }
      `);

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toContain(
        'const handleRequest = Sentry.createSentryHandleRequest',
      );
      expect(result).toContain(
        'export const handleError = Sentry.createSentryHandleError',
      );
      expect(result).toContain('export default handleRequest');
    });

    it('should add proper Sentry handle request configuration', () => {
      const entryServerAst = parseModule('');

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toMatchSnapshot();
    });

    it('should add proper Sentry handle error configuration', () => {
      const entryServerAst = parseModule('');

      instrumentHandleError(entryServerAst);

      const result = entryServerAst.generate().code;

      expect(result).toContain(
        'export const handleError = Sentry.createSentryHandleError({',
      );
      expect(result).toContain('logErrors: false');
    });
  });
});
