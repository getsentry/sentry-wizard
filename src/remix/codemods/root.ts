/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as recast from 'recast';
import * as path from 'path';

import type { ExportNamedDeclaration, Program } from '@babel/types';

import {
  builders,
  generateCode,
  loadFile,
  ProxifiedModule,
  writeFile,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';

import { ERROR_BOUNDARY_TEMPLATE } from '../templates';
import { hasSentryContent } from '../utils';
import chalk from 'chalk';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

export function wrapAppWithSentry(
  rootRouteAst: ProxifiedModule,
  rootFileName: string,
) {
  rootRouteAst.imports.$add({
    from: '@sentry/remix',
    imported: 'withSentry',
    local: 'withSentry',
  });

  recast.visit(rootRouteAst.$ast, {
    visitExportDefaultDeclaration(path) {
      if (path.value.declaration.type === 'FunctionDeclaration') {
        // Move the function declaration just before the default export
        path.insertBefore(path.value.declaration);

        // Get the name of the function to be wrapped
        const functionName: string = path.value.declaration.id.name as string;

        // Create the wrapped function call
        const functionCall = recast.types.builders.callExpression(
          recast.types.builders.identifier('withSentry'),
          [recast.types.builders.identifier(functionName)],
        );

        // Replace the default export with the wrapped function call
        path.value.declaration = functionCall;
      } else if (path.value.declaration.type === 'Identifier') {
        const rootRouteExport = rootRouteAst.exports.default;

        const expressionToWrap = generateCode(rootRouteExport.$ast).code;

        rootRouteAst.exports.default = builders.raw(
          `withSentry(${expressionToWrap})`,
        );
      } else {
        clack.log.warn(
          chalk.yellow(
            `Couldn't instrument ${chalk.bold(
              rootFileName,
            )} automatically. Wrap your default export with: ${chalk.dim(
              'withSentry()',
            )}\n`,
          ),
        );
      }

      this.traverse(path);
    },
  });
}

export async function instrumentRoot(rootFileName: string): Promise<void> {
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
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE).program
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
