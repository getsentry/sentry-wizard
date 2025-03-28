import * as fs from 'node:fs';
import * as path from 'node:path';

import * as Sentry from '@sentry/node';
import { traceStep } from '../telemetry';
import { getPackageDotJson, updatePackageDotJson } from './clack';

export interface PackageManager {
  name: string;
  label: string;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
  flags: string;
  forceInstallFlag: string;
  registry?: string;
  detect: () => boolean;
  addOverride: (pkgName: string, pkgVersion: string) => Promise<void>;
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  installCommand: 'add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
  forceInstallFlag: '--force',
  detect: () =>
    ['bun.lockb', 'bun.lock'].some((lockFile) => {
      try {
        return fs.existsSync(path.join(process.cwd(), lockFile));
      } catch (e) {
        return false;
      }
    }),
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    });
  },
};
export const DENO: PackageManager = {
  name: 'deno',
  label: 'Deno',
  installCommand: 'install',
  buildCommand: 'deno task build',
  runScriptCommand: 'deno task',
  flags: '',
  forceInstallFlag: '--force',
  registry: 'npm',
  detect: () => {
    try {
      return fs.existsSync(path.join(process.cwd(), 'deno.lock'));
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    });
  },
};
export const YARN_V1: PackageManager = {
  name: 'yarn',
  label: 'Yarn V1',
  installCommand: 'add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '--ignore-workspace-root-check',
  forceInstallFlag: '--force',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('yarn lockfile v1');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    });
  },
};
/** YARN V2/3/4 */
export const YARN_V2: PackageManager = {
  name: 'yarn',
  label: 'Yarn V2/3/4',
  installCommand: 'add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '',
  forceInstallFlag: '--force',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), 'yarn.lock'), 'utf-8')
        .slice(0, 500)
        .includes('__metadata');
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const resolutions = packageDotJson.resolutions || {};

    await updatePackageDotJson({
      ...packageDotJson,
      resolutions: {
        ...resolutions,
        [pkgName]: pkgVersion,
      },
    });
  },
};
export const PNPM: PackageManager = {
  name: 'pnpm',
  label: 'PNPM',
  installCommand: 'add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
  flags: '--ignore-workspace-root-check',
  forceInstallFlag: '--force',
  detect: () => {
    try {
      return fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'));
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const pnpm = packageDotJson.pnpm || {};
    const overrides = pnpm.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      pnpm: {
        ...pnpm,
        overrides: {
          ...overrides,
          [pkgName]: pkgVersion,
        },
      },
    });
  },
};
export const NPM: PackageManager = {
  name: 'npm',
  label: 'NPM',
  installCommand: 'install',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
  flags: '',
  forceInstallFlag: '--force',
  detect: () => {
    try {
      return fs.existsSync(path.join(process.cwd(), 'package-lock.json'));
    } catch (e) {
      return false;
    }
  },
  addOverride: async (pkgName, pkgVersion): Promise<void> => {
    const packageDotJson = await getPackageDotJson();
    const overrides = packageDotJson.overrides || {};

    await updatePackageDotJson({
      ...packageDotJson,
      overrides: {
        ...overrides,
        [pkgName]: pkgVersion,
      },
    });
  },
};

export const packageManagers = [NPM, YARN_V1, YARN_V2, PNPM, BUN, DENO];

/**
 * Exported only for testing.
 * DO NOT call this function directly!
 * Use `getPackageManger` instead.
 */
export function _detectPackageManger(
  managers?: PackageManager[],
): PackageManager | null {
  return traceStep('detect-package-manager', () => {
    const foundPackageMangers = (managers ?? packageManagers).filter(
      (packageManager) => packageManager.detect(),
    );

    // Only consider a package manager detected if we found exactly one.
    // If we find more than one, we should not make any assumptions.
    if (foundPackageMangers.length === 1) {
      Sentry.setTag('package-manager', foundPackageMangers[0].name);
      return foundPackageMangers[0];
    }

    Sentry.setTag('package-manager', 'not-detected');
    return null;
  });
}
