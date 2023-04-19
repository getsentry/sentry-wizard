/* eslint-disable @typescript-eslint/typedef */
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { green } from './Logging';

export function getPackageManagerChoice(): PackageManager | null {
  if (fs.existsSync(path.join(process.cwd(), Yarn.LOCK_FILE))) {
    return new Yarn();
  }
  if (fs.existsSync(path.join(process.cwd(), Pnpm.LOCK_FILE))) {
    return new Pnpm();
  }
  if (fs.existsSync(path.join(process.cwd(), Npm.LOCK_FILE))) {
    return new Npm();
  }
  return null;
}

export interface PackageManager {
  installPackage(packageName: string): Promise<void>;
}

export class Npm implements PackageManager {
  public static LOCK_FILE = 'package-lock.json';
  public static LABEL = 'npm';
  public static INSTALL_COMMAND = 'npm install';

  public async installPackage(packageName: string): Promise<void> {
    await installPackage(Npm.INSTALL_COMMAND, packageName, Npm.LABEL);
  }
}

export class Yarn implements PackageManager {
  public static LOCK_FILE = 'yarn.lock';
  public static LABEL = 'yarn';
  public static INSTALL_COMMAND = 'yarn add';

  public async installPackage(packageName: string): Promise<void> {
    await installPackage(Yarn.INSTALL_COMMAND, packageName, Yarn.LABEL);
  }
}

export class Pnpm implements PackageManager {
  public static LOCK_FILE = 'pnpm-lock.yaml';
  public static LABEL = 'pnpm';
  public static INSTALL_COMMAND = 'pnpm add';

  public async installPackage(packageName: string): Promise<void> {
    await installPackage(Pnpm.INSTALL_COMMAND, packageName, Pnpm.LABEL);
  }
}

async function installPackage(
  command: string,
  packageName: string,
  label: string,
): Promise<void> {
  await promisify(exec)(`${command} ${packageName}`);
  green(`✓ Added \`${packageName}\` using \`${label}\`.`);
  return;
}
