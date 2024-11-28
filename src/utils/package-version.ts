import resolve from 'resolve';
import * as path from 'path';
import * as fs from 'fs';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';
import { abort } from './clack-utils';
import { PNPM } from './package-manager';

/**
 * Unlike `getPackageVersion`, this helper uses the `resolve`
 * npm package to resolve the actually installed version of
 * a package and is not limited to direct dependencies.
 */
export async function getInstalledPackageVersion(pkg: string) {
  const isPnpm = PNPM.detect();
  try {
    const pkgJson: { version: string } = JSON.parse(
      fs
        .readFileSync(
          resolve.sync(`${pkg}/package.json`, {
            basedir: isPnpm
              ? path.join(process.cwd(), 'node_modules', '.pnpm')
              : process.cwd(),
            preserveSymlinks: isPnpm,
          }),
        )
        .toString(),
    );
    return pkgJson.version;
  } catch (e: unknown) {
    clack.log.error(`Error while evaluating version of package ${pkg}.`);
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    Sentry.captureException('Error while setting up the Nuxt SDK');
    await abort('Exiting Wizard');
  }
}
