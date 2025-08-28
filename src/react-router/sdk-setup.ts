import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion } from 'semver';

import type { PackageDotJson } from '../utils/package-json';
import { getPackageVersion } from '../utils/package-json';

const REACT_ROUTER_REVEAL_COMMAND = 'npx react-router reveal';

export function runReactRouterReveal(isTS: boolean): void {
  // Check if entry files already exist
  const clientEntryFilename = `entry.client.${isTS ? 'tsx' : 'jsx'}`;
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;

  const clientEntryPath = path.join(process.cwd(), 'app', clientEntryFilename);
  const serverEntryPath = path.join(process.cwd(), 'app', serverEntryFilename);

  if (fs.existsSync(clientEntryPath) && fs.existsSync(serverEntryPath)) {
    clack.log.info(
      `Found entry files ${chalk.cyan(clientEntryFilename)} and ${chalk.cyan(
        serverEntryFilename,
      )}.`,
    );
  } else {
    clack.log.info(
      `Couldn't find entry files in your project. Trying to run ${chalk.cyan(
        REACT_ROUTER_REVEAL_COMMAND,
      )}...`,
    );

    clack.log.info(
      childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND).toString(),
    );
  }
}

export function isReactRouterV7(packageJson: PackageDotJson): boolean {
  const reactRouterVersion = getPackageVersion(
    '@react-router/dev',
    packageJson,
  );
  if (!reactRouterVersion) {
    return false;
  }

  const minV7 = minVersion('7.0.0');
  return minV7 ? gte(reactRouterVersion, minV7) : false;
}

// Placeholder implementations to fix linting
// These will be properly implemented later
export function initializeSentryOnEntryClient(): void {
  // TODO: Implement
}

export function instrumentRootRoute(): void {
  // TODO: Implement
}

export function createServerInstrumentationFile(): string {
  // TODO: Implement
  return 'instrument.server.mjs';
}

export function insertServerInstrumentationFile(): boolean {
  // TODO: Implement
  return true;
}

export function instrumentSentryOnEntryServer(): void {
  // TODO: Implement
}

export function updateStartScript(): void {
  // TODO: Implement
}

export function updateDevScript(): void {
  // TODO: Implement
}

export function updateBuildScript(): void {
  // TODO: Implement
}
