/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion } from 'semver';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, writeFile } from 'magicast';
import { PackageDotJson, getPackageVersion } from '../utils/package-json';
import { getInitCallInsertionIndex, hasSentryContent } from './utils';
import { instrumentRootRouteV1 } from './codemods/root-v1';
import { instrumentRootRouteV2 } from './codemods/root-v2';
import { instrumentHandleError } from './codemods/handle-error';

export type PartialRemixConfig = {
  unstable_dev?: boolean;
  future?: {
    v2_dev?: boolean;
    v2_errorBoundary?: boolean;
    v2_headers?: boolean;
    v2_meta?: boolean;
    v2_normalizeFormMethod?: boolean;
    v2_routeConvention?: boolean;
  };
};

const REMIX_CONFIG_FILE = 'remix.config.js';

function insertClientInitCall(
  dsn: string,
  originalHooksMod: ProxifiedModule<any>,
): void {
  const initCall = builders.functionCall('Sentry.init', {
    dsn,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      builders.newExpression('Sentry.BrowserTracing', {
        routingInstrumentation: builders.functionCall(
          'Sentry.remixRouterInstrumentation',
          builders.raw('useEffect'),
          builders.raw('useLocation'),
          builders.raw('useMatches'),
        ),
      }),
      builders.newExpression('Sentry.Replay'),
    ],
  });

  const originalHooksModAST = originalHooksMod.$ast as Program;
  const initCallInsertionIndex = getInitCallInsertionIndex(originalHooksModAST);

  originalHooksModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

function insertServerInitCall(
  dsn: string,
  originalHooksMod: ProxifiedModule<any>,
) {
  const initCall = builders.functionCall('Sentry.init', {
    dsn,
    tracesSampleRate: 1.0,
  });

  const originalHooksModAST = originalHooksMod.$ast as Program;

  const initCallInsertionIndex = getInitCallInsertionIndex(originalHooksModAST);

  originalHooksModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

export function isRemixV2(
  remixConfig: PartialRemixConfig,
  packageJson: PackageDotJson,
): boolean {
  const remixVersion = getPackageVersion('@remix-run/react', packageJson);
  if (!remixVersion) {
    return false;
  }

  const minVer = minVersion(remixVersion);

  if (!minVer) {
    return false;
  }

  const isV2Remix = gte(minVer, '2.0.0');

  return isV2Remix || remixConfig?.future?.v2_errorBoundary || false;
}

export async function loadRemixConfig(): Promise<PartialRemixConfig> {
  const configFilePath = path.join(process.cwd(), REMIX_CONFIG_FILE);

  try {
    if (!fs.existsSync(configFilePath)) {
      return {};
    }

    const configUrl = url.pathToFileURL(configFilePath).href;
    const remixConfigModule = (await import(configUrl)) as {
      default: PartialRemixConfig;
    };

    return remixConfigModule?.default || {};
  } catch (e: unknown) {
    clack.log.error(`Couldn't load ${REMIX_CONFIG_FILE}.`);
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );

    return {};
  }
}

export async function instrumentRootRoute(
  isV2?: boolean,
  isTS?: boolean,
): Promise<void> {
  const rootFilename = `root.${isTS ? 'tsx' : 'jsx'}`;

  if (isV2) {
    await instrumentRootRouteV2(rootFilename);
  } else {
    await instrumentRootRouteV1(rootFilename);
  }

  clack.log.success(
    `Successfully instrumented root route ${chalk.cyan(rootFilename)}.`,
  );
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

export async function updateBuildScript(args: {
  org: string;
  project: string;
  url?: string;
  isHydrogen: boolean;
}): Promise<void> {
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  // Add sourcemaps option to build script
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJsonString = (
    await fs.promises.readFile(packageJsonPath)
  ).toString();
  const packageJson = JSON.parse(packageJsonString);

  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  const buildCommand = args.isHydrogen
    ? 'shopify hydrogen build'
    : 'remix build';

  const instrumentedBuildCommand =
    `${buildCommand} --sourcemap && sentry-upload-sourcemaps --org ${args.org} --project ${args.project}` +
    (args.url ? ` --url ${args.url}` : '') +
    (args.isHydrogen ? ' --buildPath ./dist' : '');

  if (!packageJson.scripts.build) {
    packageJson.scripts.build = instrumentedBuildCommand;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  } else if (packageJson.scripts.build.includes(buildCommand)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    packageJson.scripts.build = packageJson.scripts.build.replace(
      buildCommand,
      instrumentedBuildCommand,
    );
  }

  await fs.promises.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
  );

  clack.log.success(
    `Successfully updated ${chalk.cyan('build')} script in ${chalk.cyan(
      'package.json',
    )} to generate and upload sourcemaps.`,
  );
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

export async function initializeSentryOnEntryClient(
  dsn: string,
  isTS: boolean,
): Promise<void> {
  const clientEntryFilename = `entry.client.${isTS ? 'tsx' : 'jsx'}`;

  const originalEntryClient = path.join(
    process.cwd(),
    'app',
    clientEntryFilename,
  );

  const originalEntryClientMod = await loadFile(originalEntryClient);

  if (hasSentryContent(originalEntryClient, originalEntryClientMod.$code)) {
    return;
  }

  originalEntryClientMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  originalEntryClientMod.imports.$add({
    from: 'react',
    imported: 'useEffect',
    local: 'useEffect',
  });

  originalEntryClientMod.imports.$add({
    from: '@remix-run/react',
    imported: 'useLocation',
    local: 'useLocation',
  });

  originalEntryClientMod.imports.$add({
    from: '@remix-run/react',
    imported: 'useMatches',
    local: 'useMatches',
  });

  insertClientInitCall(dsn, originalEntryClientMod);

  await writeFile(
    originalEntryClientMod.$ast,
    path.join(process.cwd(), 'app', clientEntryFilename),
  );

  clack.log.success(
    `Successfully initialized Sentry on client entry point ${chalk.cyan(
      clientEntryFilename,
    )}`,
  );
}

export async function initializeSentryOnEntryServer(
  dsn: string,
  isV2: boolean,
  isTS: boolean,
): Promise<void> {
  const serverEntryFilename = `entry.server.${isTS ? 'tsx' : 'jsx'}`;

  const originalEntryServer = path.join(
    process.cwd(),
    'app',
    serverEntryFilename,
  );

  const originalEntryServerMod = await loadFile(originalEntryServer);

  if (hasSentryContent(originalEntryServer, originalEntryServerMod.$code)) {
    return;
  }

  originalEntryServerMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  insertServerInitCall(dsn, originalEntryServerMod);

  if (isV2) {
    const handleErrorInstrumented = instrumentHandleError(
      originalEntryServerMod,
      serverEntryFilename,
    );

    if (handleErrorInstrumented) {
      clack.log.success(
        `Instrumented ${chalk.cyan('handleError')} in ${chalk.cyan(
          `${serverEntryFilename}`,
        )}`,
      );
    }
  }

  await writeFile(
    originalEntryServerMod.$ast,
    path.join(process.cwd(), 'app', serverEntryFilename),
  );

  clack.log.success(
    `Successfully initialized Sentry on server entry point ${chalk.cyan(
      serverEntryFilename,
    )}.`,
  );
}
