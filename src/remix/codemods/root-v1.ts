/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import * as path from 'path';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';
import { wrapAppWithSentry } from './root-common';

export async function instrumentRootRouteV1(
  rootFileName: string,
): Promise<void> {
  try {
    const rootRouteAst = await loadFile(
      path.join(process.cwd(), 'app', rootFileName),
    );

    wrapAppWithSentry(rootRouteAst, rootFileName);

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
