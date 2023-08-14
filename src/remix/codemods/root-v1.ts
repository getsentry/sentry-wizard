/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import * as recast from 'recast';
import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, writeFile } from 'magicast';

export async function instrumentRootRouteV1(
  rootFileName: string,
): Promise<void> {
  try {
    const rootRouteAst = await loadFile(
      path.join(process.cwd(), 'app', rootFileName),
    );

    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'withSentry',
      local: 'withSentry',
    });

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

          const expressionToWrap = generateCode(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            rootRouteExport.$ast,
          ).code;

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
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
      },
    });

    await writeFile(
      rootRouteAst.$ast,
      path.join(process.cwd(), 'app', rootFileName),
    );
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error(e);
    clack.log.warn(
      chalk.yellow(
        `Something went wrong writing to ${chalk.bold(rootFileName)}`,
      ),
    );
    clack.log.info(
      `Please put the following code snippet into ${chalk.bold(
        rootFileName,
      )}: ${chalk.dim('You probably have to clean it up a bit.')}\n`,
    );
  }
}
