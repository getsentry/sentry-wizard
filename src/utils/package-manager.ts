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
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  lockFile: 'bun.lockb',
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
  flags: '',
};
export const YARN: PackageManager = {
  name: 'yarn',
  label: 'Yarn',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
  flags: '--ignore-workspace-root-check',
};
export const PNPM: PackageManager = {
  name: 'pnpm',
  label: 'PNPM',
  lockFile: 'pnpm-lock.yaml',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
  flags: '--ignore-workspace-root-check',
};
export const NPM: PackageManager = {
  name: 'npm',
  label: 'NPM',
  lockFile: 'package-lock.json',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
  flags: '',
};

export const packageManagers = [BUN, YARN, PNPM, NPM];

export function detectPackageManger(): PackageManager | null {
  return traceStep('detect-package-manager', () => {
    for (const packageManager of packageManagers) {
      if (fs.existsSync(path.join(process.cwd(), packageManager.lockFile))) {
        Sentry.setTag('package-manager', packageManager.name);
        return packageManager;
      }
    }
    Sentry.setTag('package-manager', 'not-detected');
    return null;
  });
}
