/* eslint-disable @typescript-eslint/typedef */
import * as fs from 'fs';
import * as path from 'path';

import * as Sentry from '@sentry/node';
import { traceStep } from '../telemetry';

export interface PackageManager {
  name: string;
  label: string;
  lockFile: string;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
  flags: string;
  detect: () => boolean;
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  lockFile: 'bun.lockb',
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
  detect: () => fs.existsSync(path.join(process.cwd(), BUN.lockFile)),
};
export const YARN_CLASSIC: PackageManager = {
  name: 'yarn',
  label: 'Yarn Classic',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '--ignore-workspace-root-check',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), YARN_CLASSIC.lockFile), 'utf-8')
        .slice(0, 500)
        .includes('yarn lockfile v1');
    } catch (e) {
      return false;
    }
  },
};
export const YARN: PackageManager = {
  name: 'yarn',
  label: 'Yarn',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '',
  detect: () => {
    try {
      return fs
        .readFileSync(path.join(process.cwd(), YARN.lockFile), 'utf-8')
        .slice(0, 500)
        .includes('__metadata');
    } catch (e) {
      return false;
    }
  },
};
export const PNPM: PackageManager = {
  name: 'pnpm',
  label: 'PNPM',
  lockFile: 'pnpm-lock.yaml',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
  flags: '--ignore-workspace-root-check',
  detect: () => fs.existsSync(path.join(process.cwd(), PNPM.lockFile)),
};
export const NPM: PackageManager = {
  name: 'npm',
  label: 'NPM',
  lockFile: 'package-lock.json',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
  flags: '',
  detect: () => fs.existsSync(path.join(process.cwd(), NPM.lockFile)),
};

export const packageManagers = [BUN, YARN_CLASSIC, YARN, PNPM, NPM];

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
