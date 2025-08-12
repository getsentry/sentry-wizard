/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { Program } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { Proxified, ProxifiedModule } from 'magicast';

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as childProcess from 'child_process';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import pc from 'picocolors';
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
import { instrumentRoot } from './codemods/root';
import { instrumentHandleError } from './codemods/handle-error';
import { getPackageDotJson } from '../utils/clack';
import { findCustomExpressServerImplementation } from './codemods/express-server';

export type PartialRemixConfig = {
  unstable_dev?: boolean;
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
      `Found entry files ${pc.cyan(clientEntryFilename)} and ${pc.cyan(
        serverEntryFilename,
      )}.`,
    );
  } else {
    clack.log.info(
      `Couldn't find entry files in your project. Trying to run ${pc.cyan(
        REMIX_REVEAL_COMMAND,
      )}...`,
    );

    clack.log.info(childProcess.execSync(REMIX_REVEAL_COMMAND).toString());
  }
}

interface SdkAstOptions {
  dsn: string;
  tracesSampleRate?: number;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  integrations?: Array<Proxified>;
  enableLogs?: boolean;
}

function getInitCallArgs(
  dsn: string,
  type: 'client' | 'server',
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
) {
  const initCallArgs: SdkAstOptions = {
    dsn,
  };

  // Adding tracing sample rate for both client and server
  if (selectedFeatures.performance) {
    initCallArgs.tracesSampleRate = 1.0;
  }

  // Adding logs for both client and server
  if (selectedFeatures.logs) {
    initCallArgs.enableLogs = true;
  }

  // Adding integrations and replay options only for client
  if (
    type === 'client' &&
    (selectedFeatures.performance || selectedFeatures.replay)
  ) {
    initCallArgs.integrations = [] as Array<Proxified>;

    if (selectedFeatures.performance) {
      initCallArgs.integrations.push(
        builders.functionCall(
          'browserTracingIntegration',
          builders.raw('{ useEffect, useLocation, useMatches }'),
        ),
      );
    }

    if (selectedFeatures.replay) {
      initCallArgs.integrations.push(
        builders.functionCall('replayIntegration', {
          maskAllText: true,
          blockAllMedia: true,
        }),
      );

      initCallArgs.replaysSessionSampleRate = 0.1;
      initCallArgs.replaysOnErrorSampleRate = 1.0;
    }
  }

  return initCallArgs;
}

function insertClientInitCall(
  dsn: string,
  // MagicAst returns `ProxifiedModule<any>` so therefore we have to use `any` here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalHooksMod: ProxifiedModule<any>,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
): void {
  const initCallArgs = getInitCallArgs(dsn, 'client', selectedFeatures);
  const initCall = builders.functionCall('init', initCallArgs);

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
    logs: boolean;
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
    logs: boolean;
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
    logs: boolean;
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
      `File ${pc.cyan(
        path.basename(expressServerPath),
      )} already contains instrumentation import.
Skipping adding instrumentation functionality to ${pc.cyan(
        path.basename(expressServerPath),
      )}.`,
    );

    return true;
  }

  originalExpressServerMod.$code = `import './${instrumentationFile}';\n${originalExpressServerMod.$code}`;

  fs.writeFileSync(expressServerPath, originalExpressServerMod.$code);

  return true;
}

export function isRemixV2(packageJson: PackageDotJson): boolean {
  const remixVersion = getPackageVersion('@remix-run/react', packageJson);
  if (!remixVersion) {
    return false;
  }

  const minVer = minVersion(remixVersion);

  if (!minVer) {
    return false;
  }

  return gte(minVer, '2.0.0');
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
      pc.dim(
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

export async function instrumentRootRoute(isTS?: boolean): Promise<void> {
  const rootFilename = `root.${isTS ? 'tsx' : 'jsx'}`;

  await instrumentRoot(rootFilename);

  clack.log.success(
    `Successfully instrumented root route ${pc.cyan(rootFilename)}.`,
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
    `Successfully updated ${pc.cyan('build')} script in ${pc.cyan(
      'package.json',
    )} to generate and upload sourcemaps.`,
  );
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

export function updateEntryClientMod(
  // MagicAst returns `ProxifiedModule<any>` so therefore we have to use `any` here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalEntryClientMod: ProxifiedModule<any>,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ProxifiedModule<any> {
  const imports = ['init'];
  if (selectedFeatures.replay) {
    imports.push('replayIntegration');
  }
  if (selectedFeatures.performance) {
    imports.push('browserTracingIntegration');
  }
  originalEntryClientMod.imports.$add({
    from: '@sentry/remix',
    imported: `${imports.join(', ')}`,
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
    logs: boolean;
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
    `Successfully initialized Sentry on client entry point ${pc.cyan(
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
      `Found existing NODE_OPTIONS in ${pc.cyan(
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
      `Found a ${pc.cyan('start')} script that doesn't use ${pc.cyan(
        'remix-serve',
      )} or ${pc.cyan('node')}. Skipping adding Sentry initialization.`,
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
    `Successfully updated ${pc.cyan('start')} script in ${pc.cyan(
      'package.json',
    )} to include Sentry initialization on start.`,
  );
}

export async function instrumentSentryOnEntryServer(
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

  const handleErrorInstrumented = instrumentHandleError(
    originalEntryServerMod,
    serverEntryFilename,
  );

  if (handleErrorInstrumented) {
    clack.log.success(
      `Instrumented ${pc.cyan('handleError')} in ${pc.cyan(
        `${serverEntryFilename}`,
      )}`,
    );
  }

  await writeFile(
    originalEntryServerMod.$ast,
    path.join(process.cwd(), 'app', serverEntryFilename),
  );

  clack.log.success(
    `Successfully initialized Sentry on server entry point ${pc.cyan(
      serverEntryFilename,
    )}.`,
  );
}
