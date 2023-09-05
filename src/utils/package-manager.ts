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
}

const bun: PackageManager = {
  name: 'bun',
  label: 'Bun',
  lockFile: 'bun.lockb',
  installCommand: 'bun add',
  buildCommand: 'bun build',
};
const yarn: PackageManager = {
  name: 'yarn',
  label: 'Yarn',
  lockFile: 'yarn.lock',
  installCommand: 'yarn add',
  buildCommand: 'yarn build',
};
const pnpm: PackageManager = {
  name: 'pnpm',
  label: 'PNPM',
  lockFile: 'pnpm-lock.yaml',
  installCommand: 'pnpm add',
  buildCommand: 'pnpm build',
};
const npm: PackageManager = {
  name: 'npm',
  label: 'NPM',
  lockFile: 'package-lock.json',
  installCommand: 'npm add',
  buildCommand: 'npm run build',
};

export const packageManagers = [bun, yarn, pnpm, npm];

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
