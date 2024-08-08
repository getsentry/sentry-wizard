/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { gte, minVersion } from 'semver';

import {
  builders,
  generateCode,
  loadFile,
  parseModule,
  writeFile,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';
import type { PackageDotJson } from '../utils/package-json';
import { getPackageVersion } from '../utils/package-json';
import {
  getAfterImportsInsertionIndex,
  hasSentryContent,
  serverHasInstrumentationImport,
} from './utils';
import { instrumentRootRouteV1 } from './codemods/root-v1';
import { instrumentRootRouteV2 } from './codemods/root-v2';
import { instrumentHandleError } from './codemods/handle-error';
import { getPackageDotJson } from '../utils/clack-utils';
import { findCustomExpressServerImplementation } from './codemods/express-server';

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
const REMIX_REVEAL_COMMAND = 'npx remix reveal';

export function runRemixReveal(isTS: boolean): void {
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
        REMIX_REVEAL_COMMAND,
      )}...`,
    );

    clack.log.info(childProcess.execSync(REMIX_REVEAL_COMMAND).toString());
  }
}

function getInitCallArgs(
  dsn: string,
  type: 'client' | 'server',
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
) {
  const initCallArgs = {
    dsn,
  } as Record<string, unknown>;

  // Adding tracing sample rate for both client and server
  if (selectedFeatures.performance) {
    initCallArgs.tracesSampleRate = 1.0;
  }

  // Adding integrations and replay options only for client
  if (
    type === 'client' &&
    (selectedFeatures.performance || selectedFeatures.replay)
  ) {
    initCallArgs.integrations = [];

    if (selectedFeatures.performance) {
      // @ts-expect-error - Adding Proxified AST node to the array
      initCallArgs.integrations.push(
        builders.functionCall(
          'Sentry.browserTracingIntegration',
          builders.raw('{ useEffect, useLocation, useMatches }'),
        ),
      );
    }

    if (selectedFeatures.replay) {
      // @ts-expect-error - Adding Proxified AST node to the array
      initCallArgs.integrations.push(
        builders.functionCall('Sentry.replayIntegration', {
          maskAllText: true,
          blockAllMedia: true,
        }),
      );

      initCallArgs.replaysSessionSampleRate = 0.1;
      initCallArgs.replaysOnErrorSampleRate = 1.0;
    }
  }

  // Adding autoInstrumentRemix option only for server
  if (type === 'server') {
    initCallArgs.autoInstrumentRemix = true;
  }

  return initCallArgs;
}

function insertClientInitCall(
  dsn: string,
  originalHooksMod: ProxifiedModule<any>,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): void {
  const initCallArgs = getInitCallArgs(dsn, 'client', selectedFeatures);
  const initCall = builders.functionCall('Sentry.init', initCallArgs);

  const originalHooksModAST = originalHooksMod.$ast as Program;
  const initCallInsertionIndex =
    getAfterImportsInsertionIndex(originalHooksModAST);

  originalHooksModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

export function generateServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
) {
  // create an empty file named `instrument.server.mjs`
  const instrumentationFile = 'instrumentation.server.mjs';
  const instrumentationFileMod = parseModule('');

  instrumentationFileMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  const initCallArgs = getInitCallArgs(dsn, 'server', selectedFeatures);
  const initCall = builders.functionCall('Sentry.init', initCallArgs);

  const instrumentationFileModAST = instrumentationFileMod.$ast as Program;

  const initCallInsertionIndex = getAfterImportsInsertionIndex(
    instrumentationFileModAST,
  );

  instrumentationFileModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );

  return { instrumentationFile, instrumentationFileMod };
}

export async function createServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
) {
  const { instrumentationFile, instrumentationFileMod } =
    generateServerInstrumentationFile(dsn, selectedFeatures);

  await writeFile(instrumentationFileMod.$ast, instrumentationFile);

  return instrumentationFile;
}

export async function insertServerInstrumentationFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
) {
  const instrumentationFile = await createServerInstrumentationFile(
    dsn,
    selectedFeatures,
  );

  const expressServerPath = await findCustomExpressServerImplementation();

  if (!expressServerPath) {
    return false;
  }

  const originalExpressServerMod = await loadFile(expressServerPath);

  if (
    serverHasInstrumentationImport(
      expressServerPath,
      originalExpressServerMod.$code,
    )
  ) {
    clack.log.warn(
      `File ${chalk.cyan(
        path.basename(expressServerPath),
      )} already contains instrumentation import.
Skipping adding instrumentation functionality to ${chalk.cyan(
        path.basename(expressServerPath),
      )}.`,
    );

    return true;
  }

  originalExpressServerMod.$code = `import './${instrumentationFile}';\n${originalExpressServerMod.$code}`;

  fs.writeFileSync(expressServerPath, originalExpressServerMod.$code);

  return true;
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
  const packageJson = await getPackageDotJson();

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
  } else {
    throw new Error(
      "`build` script doesn't contain a known build command. Please update it manually.",
    );
  }

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );

  clack.log.success(
    `Successfully updated ${chalk.cyan('build')} script in ${chalk.cyan(
      'package.json',
    )} to generate and upload sourcemaps.`,
  );
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

export function updateEntryClientMod(
  originalEntryClientMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
): ProxifiedModule<any> {
  originalEntryClientMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  if (selectedFeatures.performance) {
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

    originalEntryClientMod.imports.$add({
      from: 'react',
      imported: 'useEffect',
      local: 'useEffect',
    });
  }

  insertClientInitCall(dsn, originalEntryClientMod, selectedFeatures);

  return originalEntryClientMod;
}

export async function initializeSentryOnEntryClient(
  dsn: string,
  isTS: boolean,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
  },
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

  const updatedEntryClientMod = updateEntryClientMod(
    originalEntryClientMod,
    dsn,
    selectedFeatures,
  );

  await writeFile(
    updatedEntryClientMod.$ast,
    path.join(process.cwd(), 'app', clientEntryFilename),
  );

  clack.log.success(
    `Successfully initialized Sentry on client entry point ${chalk.cyan(
      clientEntryFilename,
    )}`,
  );
}

export async function updateStartScript(instrumentationFile: string) {
  const packageJson = await getPackageDotJson();

  if (!packageJson.scripts || !packageJson.scripts.start) {
    throw new Error(
      "Couldn't find a `start` script in your package.json. Please add one manually.",
    );
  }

  if (packageJson.scripts.start.includes('NODE_OPTIONS')) {
    clack.log.warn(
      `Found existing NODE_OPTIONS in ${chalk.cyan(
        'start',
      )} script. Skipping adding Sentry initialization.`,
    );

    return;
  }

  if (
    !packageJson.scripts.start.includes('remix-serve') &&
    // Adding a following empty space not to match a path that includes `node`
    !packageJson.scripts.start.includes('node ')
  ) {
    clack.log.warn(
      `Found a ${chalk.cyan('start')} script that doesn't use ${chalk.cyan(
        'remix-serve',
      )} or ${chalk.cyan('node')}. Skipping adding Sentry initialization.`,
    );

    return;
  }

  const startCommand = packageJson.scripts.start;

  packageJson.scripts.start = `NODE_OPTIONS='--import ./${instrumentationFile}' ${startCommand}`;

  await fs.promises.writeFile(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );

  clack.log.success(
    `Successfully updated ${chalk.cyan('start')} script in ${chalk.cyan(
      'package.json',
    )} to include Sentry initialization on start.`,
  );
}

export async function instrumentSentryOnEntryServer(
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
