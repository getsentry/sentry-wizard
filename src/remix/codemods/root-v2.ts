/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import * as recast from 'recast';
import * as path from 'path';

import type { ExportNamedDeclaration, Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';

import { ERROR_BOUNDARY_TEMPLATE_V2 } from '../templates';

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE_V2).program
          .body[0];

        path.insertBefore(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          recast.types.builders.exportDeclaration(false, implementation),
        );

        this.traverse(path);
      },
    });
  }

  await writeFile(
    rootRouteAst.$ast,
    path.join(process.cwd(), 'app', rootFileName),
  );
}
