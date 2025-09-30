import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion } from 'semver';

import type { PackageDotJson } from '../utils/package-json';
import { getPackageVersion } from '../utils/package-json';
import { debug } from '../utils/debug';
import { getSentryInstrumentationServerContent } from './templates';
import { instrumentRoot } from './codemods/root';
import { instrumentServerEntry } from './codemods/server-entry';
import { getPackageDotJson } from '../utils/clack';
import { instrumentClientEntry } from './codemods/client.entry';

const REACT_ROUTER_REVEAL_COMMAND = 'npx react-router reveal';

export async function tryRevealAndGetManualInstructions(
  missingFilename: string,
  filePath: string,
): Promise<boolean> {
  const shouldTryReveal = await clack.confirm({
    message: `Would you like to try running ${chalk.cyan(
      REACT_ROUTER_REVEAL_COMMAND,
    )} to generate entry files?`,
    initialValue: true,
  });

  if (shouldTryReveal) {
    try {
      clack.log.info(`Running ${chalk.cyan(REACT_ROUTER_REVEAL_COMMAND)}...`);
      const output = childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      clack.log.info(output);

      if (fs.existsSync(filePath)) {
        clack.log.success(
          `Found ${chalk.cyan(missingFilename)} after running reveal.`,
        );
        return true;
      } else {
        clack.log.warn(
          `${chalk.cyan(
            missingFilename,
          )} still not found after running reveal.`,
        );
      }
    } catch (error) {
      debug('Failed to run React Router reveal command:', error);
      clack.log.error(
        `Failed to run ${chalk.cyan(REACT_ROUTER_REVEAL_COMMAND)}.`,
      );
    }
  }

  return false; // File still doesn't exist, manual intervention needed
}

export function runReactRouterReveal(force = false): void {
  if (
    force ||
    (!fs.existsSync(path.join(process.cwd(), 'app/entry.client.tsx')) &&
      !fs.existsSync(path.join(process.cwd(), 'app/entry.client.jsx')))
  ) {
    try {
      childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      debug('Failed to run React Router reveal command:', error);
      throw error;
    }
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

  const minVer = minVersion(reactRouterVersion);

  if (!minVer) {
    return false;
  }

  return gte(minVer, '7.0.0');
}

export async function initializeSentryOnEntryClient(
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
  isTS: boolean,
): Promise<void> {
  const clientEntryFilename = `entry.client.${isTS ? 'tsx' : 'jsx'}`;
  const clientEntryPath = path.join(process.cwd(), 'app', clientEntryFilename);

  if (!fs.existsSync(clientEntryPath)) {
    clack.log.warn(`Could not find ${chalk.cyan(clientEntryFilename)}.`);

    const fileExists = await tryRevealAndGetManualInstructions(
      clientEntryFilename,
      clientEntryPath,
    );

    if (!fileExists) {
      throw new Error(`${clientEntryFilename} not found after reveal attempt`);
    }
  }

  await instrumentClientEntry(
    clientEntryPath,
    dsn,
    enableTracing,
    enableReplay,
    enableLogs,
  );

  clack.log.success(
    `Updated ${chalk.cyan(clientEntryFilename)} with Sentry initialization.`,
  );
}

export async function instrumentRootRoute(isTS: boolean): Promise<void> {
  const rootFilename = `root.${isTS ? 'tsx' : 'jsx'}`;
  const rootPath = path.join(process.cwd(), 'app', rootFilename);

  if (!fs.existsSync(rootPath)) {
    throw new Error(`${rootFilename} not found`);
  }

  await instrumentRoot(rootFilename);
  clack.log.success(`Updated ${chalk.cyan(rootFilename)} with ErrorBoundary.`);
}

export function createServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
    profiling: boolean;
  },
): string {
  const instrumentationPath = path.join(process.cwd(), 'instrument.server.mjs');

  const content = getSentryInstrumentationServerContent(
    dsn,
    selectedFeatures.performance,
    selectedFeatures.profiling,
  );

  fs.writeFileSync(instrumentationPath, content);
  clack.log.success(`Created ${chalk.cyan('instrument.server.mjs')}.`);
  return instrumentationPath;
}

export async function updatePackageJsonScripts(): Promise<void> {
  const packageJson = await getPackageDotJson();

  if (!packageJson?.scripts) {
    throw new Error(
      "Couldn't find a `scripts` section in your package.json file.",
    );
  }

  if (!packageJson.scripts.start) {
    throw new Error(
      "Couldn't find a `start` script in your package.json. Please add one manually.",
    );
  }

  if (packageJson.scripts.dev) {
    packageJson.scripts.dev =
      "NODE_OPTIONS='--import ./instrument.server.mjs' react-router dev";
  }

  packageJson.scripts.start =
    "NODE_OPTIONS='--import ./instrument.server.mjs' react-router-serve ./build/server/index.js";

  await fs.promises.writeFile(
    'package.json',
    JSON.stringify(packageJson, null, 2),
  );
}

export async function instrumentSentryOnEntryServer(
  isTS: boolean,
): Promise<void> {
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;
  const serverEntryPath = path.join(process.cwd(), 'app', serverEntryFilename);

  if (!fs.existsSync(serverEntryPath)) {
    clack.log.warn(`Could not find ${chalk.cyan(serverEntryFilename)}.`);

    const fileExists = await tryRevealAndGetManualInstructions(
      serverEntryFilename,
      serverEntryPath,
    );

    if (!fileExists) {
      throw new Error(`${serverEntryFilename} not found after reveal attempt`);
    }
  }

  await instrumentServerEntry(serverEntryPath);

  clack.log.success(
    `Updated ${chalk.cyan(serverEntryFilename)} with Sentry error handling.`,
  );
}
