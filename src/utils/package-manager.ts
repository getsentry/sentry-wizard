/* eslint-disable @typescript-eslint/typedef */
import * as fs from 'fs';
import * as path from 'path';

import * as Sentry from '@sentry/node';
import { traceStep } from '../telemetry';
import { getPackageDotJson, updatePackageDotJson } from './clack-utils';

// some package managers like Bun support multiple lock files (bun.lockb, bun.lock)
type OneLockFile = string;
type MultipleLockFiles = string[];
export type LockFile = OneLockFile | MultipleLockFiles;

export interface PackageManager<Lock = LockFile> {
  name: string;
  label: string;
  lockFile: Lock;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
  flags: string;
  detect: () => boolean;
  addOverride: (pkgName: string, pkgVersion: string) => Promise<void>;
}

export const BUN: PackageManager<MultipleLockFiles> = {
  name: 'bun',
  label: 'Bun',
  lockFile: ['bun.lockb', 'bun.lock'],
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
  detect: () =>
    BUN.lockFile.some((lockFile) =>
      fs.existsSync(path.join(process.cwd(), lockFile)),
    ),
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
export const YARN_V1: PackageManager<string> = {
  name: 'yarn',
  label: 'Yarn V1',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '--ignore-workspace-root-check',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), YARN_V1.lockFile), 'utf-8')
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
export const YARN_V2: PackageManager<OneLockFile> = {
  name: 'yarn',
  label: 'Yarn V2/3/4',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), YARN_V2.lockFile), 'utf-8')
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
export const PNPM: PackageManager<OneLockFile> = {
  name: 'pnpm',
  label: 'PNPM',
  lockFile: 'pnpm-lock.yaml',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
  flags: '--ignore-workspace-root-check',
  detect: () => fs.existsSync(path.join(process.cwd(), PNPM.lockFile)),
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
export const NPM: PackageManager<OneLockFile> = {
  name: 'npm',
  label: 'NPM',
  lockFile: 'package-lock.json',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
  flags: '',
  detect: () => fs.existsSync(path.join(process.cwd(), NPM.lockFile)),
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

export const packageManagers = [BUN, YARN_V1, YARN_V2, PNPM, NPM];

export function detectPackageManger(): PackageManager | null {
  return traceStep('detect-package-manager', () => {
    for (const packageManager of packageManagers) {
      if (packageManager.detect()) {
        Sentry.setTag('package-manager', packageManager.name);
        return packageManager;
      }
    }
    Sentry.setTag('package-manager', 'not-detected');
    return null;
  });
}
