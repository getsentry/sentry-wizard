/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as recast from 'recast';
import * as path from 'path';

import type { ExportNamedDeclaration } from '@babel/types';
import type { namedTypes as t } from 'ast-types';

import {
  loadFile,
  writeFile,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';

import { ERROR_BOUNDARY_TEMPLATE } from '../templates';
import { hasSentryContent } from '../../utils/ast-utils';
import { debug } from '../../utils/debug';

export async function instrumentRoot(rootFileName: string): Promise<void> {
  const rootRouteAst = await loadFile(
    path.join(process.cwd(), 'app', rootFileName),
  );

  const exportsAst = rootRouteAst.exports.$ast as t.Program;

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

  const alreadyHasSentry = hasSentryContent(rootRouteAst.$ast as t.Program);

  if (!alreadyHasSentry) {
    rootRouteAst.imports.$add({
      from: '@sentry/react-router',
      imported: '*',
      local: 'Sentry',
    });
  }

  if (!foundErrorBoundary) {
    // Check if `isRouteErrorResponse` is imported, as it's needed in our ErrorBoundary template
    const hasIsRouteErrorResponseImport = rootRouteAst.imports.$items.some(
      (item) =>
        item.imported === 'isRouteErrorResponse' &&
        item.from === 'react-router',
    );

    if (!hasIsRouteErrorResponseImport) {
      rootRouteAst.imports.$add({
        from: 'react-router',
        imported: 'isRouteErrorResponse',
        local: 'isRouteErrorResponse',
      });
    }

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE).program
          .body[0];

        path.insertBefore(
          recast.types.builders.exportDeclaration(false, implementation),
        );

        this.traverse(path);
      },
    });
  } else {
    let hasBlockStatementBody = false;
    let hasFunctionDeclarationBody = false;

    recast.visit(rootRouteAst.$ast, {
      visitExportNamedDeclaration(path) {
        // Find ErrorBoundary export
        if (
          path.value.declaration?.declarations?.[0].id?.name === 'ErrorBoundary'
        ) {
          hasBlockStatementBody = true;
        }

        if (path.value.declaration?.id?.name === 'ErrorBoundary') {
          hasFunctionDeclarationBody = true;
        }

        if (hasBlockStatementBody || hasFunctionDeclarationBody) {
          const errorBoundaryExport = hasBlockStatementBody
            ? path.value.declaration?.declarations?.[0].init
            : path.value.declaration;

          let alreadyHasCaptureException = false;

          // Check if `Sentry.captureException` or `captureException` is already called inside the ErrorBoundary
          recast.visit(errorBoundaryExport, {
            visitCallExpression(callPath) {
              const callee = callPath.value.callee;
              if (
                (callee.type === 'MemberExpression' &&
                  callee.object.name === 'Sentry' &&
                  callee.property.name === 'captureException') ||
                (callee.type === 'Identifier' &&
                  callee.name === 'captureException')
              ) {
                alreadyHasCaptureException = true;
              }

              this.traverse(callPath);
            },
          });

          if (!alreadyHasCaptureException) {
            // Add Sentry.captureException call
            const captureExceptionCall = recast.parse(
              `Sentry.captureException(error);`,
            ).program.body[0];

            // Check whether ErrorBoundary is a function declaration or variable declaration
            const isFunctionDeclaration =
              errorBoundaryExport.type === 'FunctionDeclaration';
            const isVariableDeclaration =
              errorBoundaryExport.type === 'VariableDeclaration';

            if (isFunctionDeclaration) {
              // If it's a function declaration, we can insert the call directly
              errorBoundaryExport.body.body.splice(
                errorBoundaryExport.body.body.length - 1,
                0,
                captureExceptionCall,
              );
            } else if (isVariableDeclaration) {
              // If it's a variable declaration, we need to find the right place to insert the call
              const init = errorBoundaryExport.init;
              if (
                init &&
                (init.type === 'ArrowFunctionExpression' ||
                  init.type === 'FunctionExpression')
              ) {
                init.body.body.splice(
                  init.body.body.length - 1,
                  0,
                  captureExceptionCall,
                );
              }
            }
          }
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
