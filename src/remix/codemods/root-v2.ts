/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import * as recast from 'recast';
import * as path from 'path';

import type { ExportNamedDeclaration, Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';

import { ERROR_BOUNDARY_TEMPLATE_V2 } from '../templates';
import { hasSentryContent } from '../utils';
import { wrapAppWithSentry } from './root-common';

export async function instrumentRootRouteV2(
  rootFileName: string,
): Promise<void> {
  const rootRouteAst = await loadFile(
    path.join(process.cwd(), 'app', rootFileName),
  );

  const exportsAst = rootRouteAst.exports.$ast as Program;

  const namedExports = exportsAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  let foundErrorBoundary = false;

  namedExports.forEach((namedExport) => {
    const declaration = namedExport.declaration;

    if (!declaration) {
      return;
    }

    if (declaration.type === 'FunctionDeclaration') {
      if (declaration.id?.name === 'ErrorBoundary') {
        foundErrorBoundary = true;
      }
    } else if (declaration.type === 'VariableDeclaration') {
      const declarations = declaration.declarations;

      declarations.forEach((declaration) => {
        // @ts-expect-error - id should always have a name in this case
        if (declaration.id?.name === 'ErrorBoundary') {
          foundErrorBoundary = true;
        }
      });
    }
  });

  if (!foundErrorBoundary) {
    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'captureRemixErrorBoundaryError',
      local: 'captureRemixErrorBoundaryError',
    });

    rootRouteAst.imports.$add({
      from: '@remix-run/react',
      imported: 'useRouteError',
      local: 'useRouteError',
    });

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE_V2).program
          .body[0];

        path.insertBefore(
          recast.types.builders.exportDeclaration(false, implementation),
        );

        this.traverse(path);
      },
    });
    // If there is already a ErrorBoundary export, and it doesn't have Sentry content
  } else if (!hasSentryContent(rootFileName, rootRouteAst.$code)) {
    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'captureRemixErrorBoundaryError',
      local: 'captureRemixErrorBoundaryError',
    });

    wrapAppWithSentry(rootRouteAst, rootFileName);

    recast.visit(rootRouteAst.$ast, {
      visitExportNamedDeclaration(path) {
        // Find ErrorBoundary export
        if (path.value.declaration?.id?.name === 'ErrorBoundary') {
          const errorBoundaryExport = path.value.declaration;

          let errorIdentifier;

          // check if useRouteError is called
          recast.visit(errorBoundaryExport, {
            visitVariableDeclaration(path) {
              const variableDeclaration = path.value.declarations[0];
              const initializer = variableDeclaration.init;

              if (
                initializer.type === 'CallExpression' &&
                initializer.callee.name === 'useRouteError'
              ) {
                errorIdentifier = variableDeclaration.id.name;
              }

              this.traverse(path);
            },
          });

          // We don't have an errorIdentifier, which means useRouteError is not called / imported
          // We need to add it and capture the error
          if (!errorIdentifier) {
            rootRouteAst.imports.$add({
              from: '@remix-run/react',
              imported: 'useRouteError',
              local: 'useRouteError',
            });

            const useRouteErrorCall = recast.parse(
              `const error = useRouteError();`,
            ).program.body[0];

            // Insert at the top of ErrorBoundary body
            errorBoundaryExport.body.body.splice(0, 0, useRouteErrorCall);
          }

          const captureErrorCall = recast.parse(
            `captureRemixErrorBoundaryError(error);`,
          ).program.body[0];

          // Insert just before the the fallback page is returned
          errorBoundaryExport.body.body.splice(
            errorBoundaryExport.body.body.length - 1,
            0,
            captureErrorCall,
          );
        }
        this.traverse(path);
      },
    });
  }

  await writeFile(
    rootRouteAst.$ast,
    path.join(process.cwd(), 'app', rootFileName),
  );
}
