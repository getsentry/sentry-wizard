/* eslint-disable @typescript-eslint/typedef */
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

export interface PackageManager {
  name: string;
  label: string;
  lockFile: string;
  installCommand: string;
  buildCommand: string;
  /* The command that the package manager uses to run a script from package.json */
  runScriptCommand: string;
}

export const BUN: PackageManager = {
  name: 'bun',
  label: 'Bun',
  lockFile: 'bun.lockb',
  installCommand: 'bun add',
  buildCommand: 'bun run build',
  runScriptCommand: 'bun run',
};
export const YARN: PackageManager = {
  name: 'yarn',
  label: 'Yarn',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
  runScriptCommand: 'yarn',
};
export const PNPM: PackageManager = {
  name: 'pnpm',
  label: 'PNPM',
  lockFile: 'pnpm-lock.yaml',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
  runScriptCommand: 'pnpm',
};
export const NPM: PackageManager = {
  name: 'npm',
  label: 'NPM',
  lockFile: 'package-lock.json',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
  runScriptCommand: 'npm run',
};

export const packageManagers = [BUN, YARN, PNPM, NPM];

export function detectPackageManger(): PackageManager | null {
  for (const packageManager of packageManagers) {
    if (fs.existsSync(path.join(process.cwd(), packageManager.lockFile))) {
      return packageManager;
    }
  }
  // We make the default NPM - it's weird if we don't find any lock file
  return null;
}

export async function installPackageWithPackageManager(
  packageManager: PackageManager,
  packageName: string,
): Promise<void> {
  await promisify(exec)(`${packageManager.installCommand} ${packageName}`);
}
