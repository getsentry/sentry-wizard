/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as recast from 'recast';

import {
  ProxifiedModule,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';

export function instrumentHandleError(entryServerAst: ProxifiedModule): void {
  // Add Sentry handle request and handle error functions
  const handleRequestTemplate = `
const handleRequest = Sentry.createSentryHandleRequest({
  ServerRouter,
  renderToPipeableStream,
  createReadableStreamFromReadable,
});
`;

  const handleErrorTemplate = `
export const handleError = Sentry.createSentryHandleError({
  logErrors: false
});
`;

  // Insert the handle request function
  const handleRequestAst = recast.parse(handleRequestTemplate).program.body[0];
  const handleErrorAst = recast.parse(handleErrorTemplate).program.body[0];

  // Add the imports for React Router server functions
  entryServerAst.imports.$add({
    from: '@react-router/node',
    imported: 'createReadableStreamFromReadable',
    local: 'createReadableStreamFromReadable',
  });

  entryServerAst.imports.$add({
    from: 'react-dom/server',
    imported: 'renderToPipeableStream',
    local: 'renderToPipeableStream',
  });

  entryServerAst.imports.$add({
    from: 'react-router',
    imported: 'ServerRouter',
    local: 'ServerRouter',
  });

  // Find the insertion point after imports
  let insertionIndex = 0;
  recast.visit(entryServerAst.$ast, {
    visitImportDeclaration(path) {
      insertionIndex = Math.max(insertionIndex, path.value.loc?.end?.line || 0);
      this.traverse(path);
    },
  });

  // Insert the handle request and error functions
  recast.visit(entryServerAst.$ast, {
    visitProgram(path) {
      path.value.body.push(handleRequestAst);
      path.value.body.push(handleErrorAst);
      this.traverse(path);
    },
  });

  // Replace default export with handleRequest
  recast.visit(entryServerAst.$ast, {
    visitExportDefaultDeclaration(path) {
      path.value.declaration =
        recast.types.builders.identifier('handleRequest');
      this.traverse(path);
    },
  });
}
