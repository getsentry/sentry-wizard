/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import * as recast from 'recast';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, ProxifiedModule, generateCode } from 'magicast';

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
