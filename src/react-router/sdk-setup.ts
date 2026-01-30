import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion, valid, coerce } from 'semver';

import type { PackageDotJson } from '../utils/package-json';
import { getPackageVersion } from '../utils/package-json';
import { debug } from '../utils/debug';

/**
 * Attempts to get the actual installed version of a package from node_modules.
 * This is more accurate than reading from package.json when users specify loose
 * version ranges (like "7.x" or ">=7.0.0").
 *
 * @returns The installed version string, or undefined if not found
 */
function getInstalledPackageVersion(packageName: string): string | undefined {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      'node_modules',
      packageName,
      'package.json',
    );

    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };
    return packageJson.version;
  } catch (e) {
    debug(
      `Could not read installed version for ${packageName}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return undefined;
  }
}
import { getSentryInstrumentationServerContent } from './templates';
import { instrumentRoot } from './codemods/root';
import { instrumentServerEntry } from './codemods/server-entry';
import { getPackageDotJson } from '../utils/clack';
import { instrumentClientEntry } from './codemods/client.entry';
import { instrumentViteConfig } from './codemods/vite';
import { instrumentReactRouterConfig } from './codemods/react-router-config';

const REACT_ROUTER_REVEAL_COMMAND = 'npx react-router reveal';
const INSTRUMENTATION_FILE = 'instrument.server.mjs';
const APP_DIRECTORY = 'app';
const ROUTES_DIRECTORY = 'routes';

function _formatConfigErrorMessage(
  filename: string,
  errorMessage: string,
  fallbackHint: string,
): string {
  return (
    `Could not automatically configure ${filename}. ${errorMessage}\n` +
    `This may happen if your config has an unusual format. ` +
    `${fallbackHint}`
  );
}

function getAppFilePath(
  filename: string,
  isTS: boolean,
  isPage = true,
): string {
  const ext = isPage ? (isTS ? 'tsx' : 'jsx') : isTS ? 'ts' : 'js';
  return path.join(process.cwd(), APP_DIRECTORY, `${filename}.${ext}`);
}

export function getRouteFilePath(filename: string, isTS: boolean): string {
  const ext = isTS ? 'tsx' : 'jsx';
  return path.join(
    process.cwd(),
    APP_DIRECTORY,
    ROUTES_DIRECTORY,
    `${filename}.${ext}`,
  );
}

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
    } catch (e) {
      debug('Failed to run React Router reveal command:', e);
      clack.log.warn(
        `Failed to run ${chalk.cyan(
          REACT_ROUTER_REVEAL_COMMAND,
        )}. This command generates entry files for React Router v7.`,
      );
    }
  }

  return false; // File still doesn't exist, manual intervention needed
}

async function ensureEntryFileExists(
  filename: string,
  filePath: string,
): Promise<void> {
  if (fs.existsSync(filePath)) {
    return; // File exists, nothing to do
  }

  clack.log.warn(`Could not find ${chalk.cyan(filename)}.`);

  const fileExists = await tryRevealAndGetManualInstructions(
    filename,
    filePath,
  );

  if (!fileExists) {
    throw new Error(
      `Failed to create or find ${filename}. Please create this file manually or ensure your React Router v7 project structure is correct.`,
    );
  }
}

export function runReactRouterReveal(): void {
  if (
    !fs.existsSync(path.join(process.cwd(), 'app', 'entry.client.tsx')) &&
    !fs.existsSync(path.join(process.cwd(), 'app', 'entry.client.jsx'))
  ) {
    try {
      childProcess.execSync(REACT_ROUTER_REVEAL_COMMAND, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      debug('Failed to run React Router reveal command:', e);
      throw e;
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

  try {
    const minVer = minVersion(reactRouterVersion);

    if (!minVer) {
      return false;
    }

    // Extract major.minor.patch to handle pre-release versions correctly
    // (e.g., 7.0.0-beta.1 should be considered v7)
    const baseVersionStr = `${minVer.major}.${minVer.minor}.${minVer.patch}`;
    return gte(baseVersionStr, '7.0.0');
  } catch {
    // Handle invalid version strings gracefully
    debug(
      `Invalid version string for @react-router/dev: "${reactRouterVersion}"`,
    );
    return false;
  }
}

/**
 * Checks if React Router version supports the Instrumentation API (>= 7.9.5)
 * The instrumentation API was introduced in React Router 7.9.5 and provides
 * automatic span creation for loaders, actions, middleware, navigations, etc.
 *
 * This function first checks the actually installed version from node_modules,
 * which is more accurate when users specify loose version ranges (like "7.x").
 * Falls back to package.json version range analysis if node_modules is unavailable.
 */
export function supportsInstrumentationAPI(
  packageJson: PackageDotJson,
): boolean {
  // First, try to get the actually installed version from node_modules
  // This is more accurate for loose ranges like "7.x" or ">=7.0.0"
  const installedVersion = getInstalledPackageVersion('@react-router/dev');

  if (installedVersion) {
    try {
      // Use coerce to handle various version formats (including pre-release)
      const coercedVersion = coerce(installedVersion);
      if (coercedVersion && gte(coercedVersion.version, '7.9.5')) {
        debug(
          `Detected installed @react-router/dev version ${installedVersion} (>= 7.9.5), Instrumentation API supported`,
        );
        return true;
      }

      // Direct comparison for valid semver
      if (valid(installedVersion)) {
        const match = installedVersion.match(/^(\d+\.\d+\.\d+)/);
        if (match) {
          return gte(match[1], '7.9.5');
        }
        return gte(installedVersion, '7.9.5');
      }
    } catch (e) {
      debug(
        `Error checking installed version: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  // Fallback: Check version range from package.json
  const reactRouterVersion = getPackageVersion(
    '@react-router/dev',
    packageJson,
  );
  if (!reactRouterVersion) {
    return false;
  }

  try {
    // If it's a concrete version (not a range), use direct comparison
    // Note: Pre-release versions like "7.9.5-beta.1" are valid concrete versions
    // but semver considers them less than "7.9.5", so we handle them specially
    if (valid(reactRouterVersion)) {
      // For pre-release versions, extract the base version and compare
      // e.g., "7.9.5-beta.1" → compare "7.9.5" >= "7.9.5"
      const match = reactRouterVersion.match(/^(\d+\.\d+\.\d+)/);
      if (match) {
        return gte(match[1], '7.9.5');
      }
      return gte(reactRouterVersion, '7.9.5');
    }

    // For version ranges (e.g., "^7.9.5", "~7.10.0", ">=7.9.5")
    // Use minVersion to get the lowest satisfying version
    // Note: This may be conservative for loose ranges like "7.x"
    const minVer = minVersion(reactRouterVersion);
    if (!minVer) {
      return false;
    }

    // Extract major.minor.patch to handle pre-release versions in ranges correctly
    const baseVersionStr = `${minVer.major}.${minVer.minor}.${minVer.patch}`;
    return gte(baseVersionStr, '7.9.5');
  } catch {
    // Handle invalid version strings gracefully
    debug(
      `Invalid version string for @react-router/dev: "${reactRouterVersion}"`,
    );
    return false;
  }
}

export async function initializeSentryOnEntryClient(
  dsn: string,
  enableTracing: boolean,
  enableReplay: boolean,
  enableLogs: boolean,
  isTS: boolean,
  useInstrumentationAPI = false,
): Promise<void> {
  const clientEntryPath = getAppFilePath('entry.client', isTS);
  const clientEntryFilename = path.basename(clientEntryPath);

  await ensureEntryFileExists(clientEntryFilename, clientEntryPath);

  await instrumentClientEntry(
    clientEntryPath,
    dsn,
    enableTracing,
    enableReplay,
    enableLogs,
    useInstrumentationAPI,
  );

  clack.log.success(
    `Successfully updated ${chalk.cyan(
      clientEntryFilename,
    )} with Sentry initialization.`,
  );
}

export async function instrumentRootRoute(isTS: boolean): Promise<void> {
  const rootPath = getAppFilePath('root', isTS);
  const rootFilename = path.basename(rootPath);

  if (!fs.existsSync(rootPath)) {
    throw new Error(
      `${rootFilename} not found in app directory. Please ensure your React Router v7 app has a root.tsx/jsx file in the app folder.`,
    );
  }

  await instrumentRoot(rootFilename);
  clack.log.success(
    `Successfully updated ${chalk.cyan(rootFilename)} with ErrorBoundary.`,
  );
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
  const instrumentationPath = path.join(process.cwd(), INSTRUMENTATION_FILE);

  const content = getSentryInstrumentationServerContent(
    dsn,
    selectedFeatures.performance,
    selectedFeatures.profiling,
    selectedFeatures.logs,
  );

  fs.writeFileSync(instrumentationPath, content);
  clack.log.success(
    `Successfully created ${chalk.cyan(INSTRUMENTATION_FILE)}.`,
  );
  return instrumentationPath;
}

export async function updatePackageJsonScripts(): Promise<void> {
  const packageJson = await getPackageDotJson();

  if (!packageJson?.scripts) {
    throw new Error(
      'Could not find a `scripts` section in your package.json file. Please add scripts manually or ensure your package.json is valid.',
    );
  }

  if (!packageJson.scripts.start) {
    throw new Error(
      'Could not find a `start` script in your package.json. Please add: "start": "react-router-serve ./build/server/index.js" and re-run the wizard.',
    );
  }

  function mergeNodeOptions(
    scriptCommand: string,
    instrumentPath = './instrument.server.mjs',
  ): string {
    if (scriptCommand.includes(instrumentPath)) {
      return scriptCommand;
    }

    const quotedMatch = scriptCommand.match(/NODE_OPTIONS=(['"])([^'"]*)\1/);
    if (quotedMatch) {
      const existingOptions = quotedMatch[2];
      const mergedOptions =
        `${existingOptions} --import ${instrumentPath}`.trim();
      return scriptCommand.replace(
        /NODE_OPTIONS=(['"])([^'"]*)\1/,
        `NODE_OPTIONS='${mergedOptions}'`,
      );
    }

    const unquotedMatch = scriptCommand.match(
      /NODE_OPTIONS=([^\s]+(?:\s+[^\s]+)*?)(\s+(?:react-router-serve|react-router|node|npx|tsx))/,
    );
    if (unquotedMatch) {
      const existingOptions = unquotedMatch[1];
      const commandPart = unquotedMatch[2];
      const mergedOptions =
        `${existingOptions} --import ${instrumentPath}`.trim();
      return scriptCommand.replace(
        /NODE_OPTIONS=([^\s]+(?:\s+[^\s]+)*?)(\s+(?:react-router-serve|react-router|node|npx|tsx))/,
        `NODE_OPTIONS='${mergedOptions}'${commandPart}`,
      );
    }

    return `NODE_OPTIONS='--import ${instrumentPath}' ${scriptCommand}`;
  }

  if (packageJson.scripts.dev) {
    packageJson.scripts.dev = mergeNodeOptions(packageJson.scripts.dev);
  }

  const startScript = packageJson.scripts.start;
  if (
    !startScript.includes(INSTRUMENTATION_FILE) &&
    !startScript.includes('NODE_OPTIONS')
  ) {
    packageJson.scripts.start = `NODE_OPTIONS='--import ./${INSTRUMENTATION_FILE}' react-router-serve ./build/server/index.js`;
  } else {
    packageJson.scripts.start = mergeNodeOptions(startScript);
  }

  await fs.promises.writeFile(
    'package.json',
    JSON.stringify(packageJson, null, 2),
  );
}

export async function instrumentSentryOnEntryServer(
  isTS: boolean,
  useInstrumentationAPI = false,
): Promise<void> {
  const serverEntryPath = getAppFilePath('entry.server', isTS);
  const serverEntryFilename = path.basename(serverEntryPath);

  await ensureEntryFileExists(serverEntryFilename, serverEntryPath);

  await instrumentServerEntry(serverEntryPath, useInstrumentationAPI);

  clack.log.success(
    `Successfully updated ${chalk.cyan(
      serverEntryFilename,
    )} with Sentry error handling.`,
  );
}

export async function configureReactRouterVitePlugin(
  orgSlug: string,
  projectSlug: string,
): Promise<void> {
  const configPath = fs.existsSync(path.join(process.cwd(), 'vite.config.ts'))
    ? path.join(process.cwd(), 'vite.config.ts')
    : path.join(process.cwd(), 'vite.config.js');
  const filename = chalk.cyan(path.basename(configPath));

  try {
    const { wasConverted } = await instrumentViteConfig(orgSlug, projectSlug);

    clack.log.success(
      `Successfully updated ${filename} with sentryReactRouter plugin.`,
    );

    if (wasConverted) {
      clack.log.info(
        `Converted your Vite config to function form ${chalk.dim(
          '(defineConfig(config => ({ ... })))',
        )} to support the Sentry React Router plugin.`,
      );
    }
  } catch (e) {
    debug('Failed to modify vite config:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new Error(
      _formatConfigErrorMessage(
        filename,
        errorMessage,
        'You may need to add the plugin manually.',
      ),
    );
  }
}

export async function configureReactRouterConfig(isTS: boolean): Promise<void> {
  const configFilename = `react-router.config.${isTS ? 'ts' : 'js'}`;
  const configPath = path.join(process.cwd(), configFilename);
  const filename = chalk.cyan(configFilename);

  try {
    const fileExistedBefore = fs.existsSync(configPath);

    const { ssrWasChanged } = await instrumentReactRouterConfig(isTS);

    if (fileExistedBefore) {
      clack.log.success(
        `Successfully updated ${filename} with Sentry buildEnd hook.`,
      );
    } else {
      clack.log.success(
        `Successfully created ${filename} with Sentry buildEnd hook.`,
      );
    }

    if (ssrWasChanged) {
      clack.log.warn(
        `${chalk.yellow(
          'Note:',
        )} SSR has been enabled in your React Router config (${chalk.cyan(
          'ssr: true',
        )}). This is required for Sentry sourcemap uploads to work correctly.`,
      );
    }
  } catch (e) {
    debug('Failed to modify react-router.config:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new Error(
      _formatConfigErrorMessage(
        filename,
        errorMessage,
        'You may need to add the buildEnd hook manually.',
      ),
    );
  }
}
