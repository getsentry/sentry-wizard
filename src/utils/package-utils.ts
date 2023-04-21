import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { abort } from './clack-utils';

export type PackageDotJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export async function getPackageDotJson(): Promise<PackageDotJson> {
  const packageJsonFileContents = await fs.promises
    .readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    .catch(() => {
      clack.log.error(
        'Could not find package.json. Make sure to run the wizard in the root of your Next.js app!',
      );
      abort();
    });

  let packageJson: PackageDotJson | undefined = undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    packageJson = JSON.parse(packageJsonFileContents);
  } catch {
    clack.log.error(
      'Unable to parse your package.json. Make sure it has a valid format!',
    );

    abort();
  }

  return packageJson || {};
}

export async function hasPackageInstalled(
  packageName: string,
  packageJson: PackageDotJson,
): Promise<boolean> {
  return (
    !!packageJson?.dependencies?.[packageName] ||
    !!packageJson?.devDependencies?.[packageName]
  );
}
