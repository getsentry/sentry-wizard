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
import {
  hasSentryContent,
  safeGetFunctionBody,
  safeInsertBeforeReturn,
} from '../../utils/ast-utils';
import { debug } from '../../utils/debug';

function hasCaptureExceptionCall(node: t.Node): boolean {
  let found = false;
  recast.visit(node, {
    visitCallExpression(path) {
      const callee = path.value.callee;
      if (
        (callee.type === 'MemberExpression' &&
          callee.object?.name === 'Sentry' &&
          callee.property?.name === 'captureException') ||
        (callee.type === 'Identifier' && callee.name === 'captureException')
      ) {
        found = true;
      }
      this.traverse(path);
    },
  });
  return found;
}

function addCaptureExceptionCall(functionNode: t.Node): void {
  const captureExceptionCall = recast.parse(
    `if (error && error instanceof Error) {\n  Sentry.captureException(error);\n}`,
  ).program.body[0];

  const functionBody = safeGetFunctionBody(functionNode);
  if (functionBody) {
    if (!safeInsertBeforeReturn(functionBody, captureExceptionCall)) {
      functionBody.push(captureExceptionCall);
    }
  } else {
    debug('Could not safely access ErrorBoundary function body');
  }
}

function findErrorBoundaryInExports(
  namedExports: ExportNamedDeclaration[],
): boolean {
  return namedExports.some((namedExport) => {
    const declaration = namedExport.declaration;

    if (!declaration) {
      return namedExport.specifiers?.some(
        (spec) =>
          spec.type === 'ExportSpecifier' &&
          spec.exported?.type === 'Identifier' &&
          spec.exported.name === 'ErrorBoundary',
      );
    }

    if (declaration.type === 'FunctionDeclaration') {
      return declaration.id?.name === 'ErrorBoundary';
    }

    if (declaration.type === 'VariableDeclaration') {
      return declaration.declarations.some((decl) => {
        // @ts-expect-error - id should always have a name in this case
        return decl.id?.name === 'ErrorBoundary';
      });
    }

    return false;
  });
}

export async function instrumentRoot(rootFileName: string): Promise<void> {
  const filePath = path.join(process.cwd(), 'app', rootFileName);
  const rootRouteAst = await loadFile(filePath);

  const exportsAst = rootRouteAst.exports.$ast as t.Program;
  const namedExports = exportsAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  const foundErrorBoundary = findErrorBoundaryInExports(namedExports);
  const alreadyHasSentry = hasSentryContent(rootRouteAst.$ast as t.Program);

  if (!alreadyHasSentry) {
    rootRouteAst.imports.$add({
      from: '@sentry/react-router',
      imported: '*',
      local: 'Sentry',
    });
  }

  if (!foundErrorBoundary) {
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
    recast.visit(rootRouteAst.$ast, {
      visitExportNamedDeclaration(path) {
        const declaration = path.value.declaration;
        if (!declaration) {
          this.traverse(path);
          return;
        }

        let functionToInstrument = null;

        if (
          declaration.type === 'FunctionDeclaration' &&
          declaration.id?.name === 'ErrorBoundary'
        ) {
          functionToInstrument = declaration;
        } else if (
          declaration.type === 'VariableDeclaration' &&
          declaration.declarations?.[0]?.id?.name === 'ErrorBoundary'
        ) {
          const init = declaration.declarations[0].init;
          if (
            init &&
            (init.type === 'FunctionExpression' ||
              init.type === 'ArrowFunctionExpression')
          ) {
            functionToInstrument = init;
          }
        }

        if (
          functionToInstrument &&
          !hasCaptureExceptionCall(functionToInstrument)
        ) {
          addCaptureExceptionCall(functionToInstrument);
        }

        this.traverse(path);
      },

      visitVariableDeclaration(path) {
        if (path.value.declarations?.[0]?.id?.name === 'ErrorBoundary') {
          const init = path.value.declarations[0].init;
          if (
            init &&
            (init.type === 'FunctionExpression' ||
              init.type === 'ArrowFunctionExpression') &&
            !hasCaptureExceptionCall(init)
          ) {
            addCaptureExceptionCall(init);
          }
        }
        this.traverse(path);
      },

      visitFunctionDeclaration(path) {
        if (
          path.value.id?.name === 'ErrorBoundary' &&
          !hasCaptureExceptionCall(path.value)
        ) {
          addCaptureExceptionCall(path.value);
        }
        this.traverse(path);
      },
    });
  }

  await writeFile(rootRouteAst.$ast, filePath);
}
