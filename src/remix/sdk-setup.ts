import type { ExportNamedDeclaration, Program } from '@babel/types';

// @ts-ignore - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import chalk from 'chalk';
import { parse } from 'semver';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, writeFile } from 'magicast';
import * as recast from 'recast';
import {
  ERROR_BOUNDARY_TEMPLATE_V2,
  HANDLE_ERROR_TEMPLATE_V2,
} from './templates';
import { PackageDotJson, getPackageVersion } from '../utils/package-json';

const rootFile = 'app/root.tsx';

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

// Copied from sveltekit wizard
function hasSentryContent(fileName: string, fileContent: string): boolean {
  if (fileContent.includes('@sentry/remix')) {
    clack.log.warn(
      `File ${chalk.cyan(path.basename(fileName))} already contains Sentry code.
Skipping adding Sentry functionality to ${chalk.cyan(
        path.basename(fileName),
      )}.`,
    );

    return true;
  }
  return false;
}

/**
 * Copied from sveltekit wizard
 * We want to insert the init call on top of the file but after all import statements
 */
function getInitCallInsertionIndex(originalHooksModAST: Program): number {
  // We need to deep-copy here because reverse mutates in place
  const copiedBodyNodes = [...originalHooksModAST.body];
  const lastImportDeclaration = copiedBodyNodes
    .reverse()
    .find((node) => node.type === 'ImportDeclaration');

  const initCallInsertionIndex = lastImportDeclaration
    ? originalHooksModAST.body.indexOf(lastImportDeclaration) + 1
    : 0;
  return initCallInsertionIndex;
}

function insertClientInitCall(
  dsn: string,
  originalHooksMod: ProxifiedModule<any>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCall = builders.functionCall('Sentry.init', {
    dsn,
    tracesSampleRate: 1.0,
    integrations: [
      builders.newExpression('Sentry.BrowserTracing', {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // @ts-ignore - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

function insertServerInitCall(
  dsn: string,
  originalHooksMod: ProxifiedModule<any>,
) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCall = builders.functionCall('Sentry.init', {
    dsn,
    tracesSampleRate: 1.0,
  });

  const originalHooksModAST = originalHooksMod.$ast as Program;

  const initCallInsertionIndex = getInitCallInsertionIndex(originalHooksModAST);

  originalHooksModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-ignore - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

function instrumentHandleError(
  originalEntryServerTsxMod: ProxifiedModule<any>,
) {
  const originalEntryServerTsxModAST =
    originalEntryServerTsxMod.$ast as Program;

  const handleErrorFunction = originalEntryServerTsxModAST.body.find(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      node.declaration.id?.name === 'handleError',
  );

  if (!handleErrorFunction) {
    clack.log.warn(
      `Could not find function ${chalk.cyan('handleError')} in ${chalk.cyan(
        'entry.server.tsx',
      )}. Creating one for you.`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const implementation = recast.parse(HANDLE_ERROR_TEMPLATE_V2).program
      .body[0];

    originalEntryServerTsxModAST.body.splice(
      getInitCallInsertionIndex(originalEntryServerTsxModAST),
      0,
      // @ts-ignore - string works here because the AST is proxified by magicast
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      recast.types.builders.exportNamedDeclaration(implementation),
    );
  } else {
    if (
      hasSentryContent(
        generateCode(handleErrorFunction).code,
        originalEntryServerTsxMod.$code,
      )
    ) {
      // Bail out
      return;
    }
    // @ts-ignore - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    handleErrorFunction.declaration.body.body.unshift(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      recast.parse(HANDLE_ERROR_TEMPLATE_V2).program.body[0].body.body[0],
    );
  }
}

async function instrumentRootRouteV1(): Promise<void> {
  try {
    const rootRouteAst = await loadFile(
      path.join(process.cwd(), 'app', 'root.tsx'),
    );

    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'withSentry',
      local: 'withSentry',
    });

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
        if (path.value.declaration.type === 'FunctionDeclaration') {
          // Move the function declaration just before the default export
          path.insertBefore(path.value.declaration);

          // Get the name of the function to be wrapped
          const functionName: string = path.value.declaration.id.name as string;

          // Create the wrapped function call
          const functionCall = recast.types.builders.callExpression(
            recast.types.builders.identifier('withSentry'),
            [recast.types.builders.identifier(functionName)],
          );

          // Replace the default export with the wrapped function call
          path.value.declaration = functionCall;
        } else if (path.value.declaration.type === 'Identifier') {
          const rootRouteExport = rootRouteAst.exports.default;

          const expressionToWrap = generateCode(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            rootRouteExport.$ast,
          ).code;

          rootRouteAst.exports.default = builders.raw(
            `withSentry(${expressionToWrap})`,
          );
        } else {
          clack.log.warn(
            chalk.yellow(
              `Couldn't instrument ${chalk.bold(
                rootFile,
              )} automatically. wrap your default export with: ${chalk.dim(
                'withSentry()',
              )}\n`,
            ),
          );
        }

        this.traverse(path);
        /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
      },
    });

    await writeFile(
      rootRouteAst.$ast,
      path.join(process.cwd(), 'app', 'root.tsx'),
    );
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error(e);
    clack.log.warn(
      chalk.yellow(`Something went wrong writing to ${chalk.bold(rootFile)}`),
    );
    clack.log.info(
      `Please put the following code snippet into ${chalk.bold(
        rootFile,
      )}: ${chalk.dim('You probably have to clean it up a bit.')}\n`,
    );
  }
}

async function instrumentRootRouteV2(): Promise<void> {
  const rootRouteAst = await loadFile(
    path.join(process.cwd(), 'app', 'root.tsx'),
  );

  const exportsAst = rootRouteAst.exports.$ast as Program;

  const namedExports = exportsAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  let foundErrorBoundary = false;

  namedExports.forEach((namedExport) => {
    const declaration = namedExport.declaration;

    if (!declaration) {
      return;
    }

    if (declaration.type === 'FunctionDeclaration') {
      if (declaration.id?.name === 'ErrorBoundary') {
        foundErrorBoundary = true;
      }
    } else if (declaration.type === 'VariableDeclaration') {
      const declarations = declaration.declarations;

      declarations.forEach((declaration) => {
        // @ts-ignore - id should always have a name in this case
        if (declaration.id?.name === 'ErrorBoundary') {
          foundErrorBoundary = true;
        }
      });
    }
  });

  if (!foundErrorBoundary) {
    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'captureRemixErrorBoundaryError',
      local: 'captureRemixErrorBoundaryError',
    });

    rootRouteAst.imports.$add({
      from: '@remix-run/react',
      imported: 'useRouteError',
      local: 'useRouteError',
    });

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE_V2).program
          .body[0];

        path.insertBefore(
          recast.types.builders.exportDeclaration(false, implementation),
        );

        this.traverse(path);
      },
    });
  }

  await writeFile(
    rootRouteAst.$ast,
    path.join(process.cwd(), 'app', 'root.tsx'),
  );
}

export function isRemixV2(
  remixConfig: PartialRemixConfig,
  packageJson: PackageDotJson,
): boolean {
  const remixVersion = getPackageVersion('@remix-run/react', packageJson);
  const remixVersionMajor = remixVersion && parse(remixVersion)?.major;
  const isV2Remix = remixVersionMajor && remixVersionMajor >= 2;

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
    clack.log.error(
      `Couldn't load ${REMIX_CONFIG_FILE}. Please make sure, you're running this wizard with Node 14 or newer`,
    );
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

export async function instrumentRootRoute(isV2?: boolean): Promise<void> {
  if (isV2) {
    return await instrumentRootRouteV2();
  } else {
    return await instrumentRootRouteV1();
  }
}

export async function instrumentPackageJson(): Promise<void> {
  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  // Add sourcemaps option to build script
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJsonString = (
    await fs.promises.readFile(packageJsonPath)
  ).toString();
  const packageJson = JSON.parse(packageJsonString);

  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  if (!packageJson.scripts.build) {
    packageJson.scripts.build =
      'remix build --sourcemap && sentry-upload-sourcemaps';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  } else if (packageJson.scripts.build.includes('remix build')) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    packageJson.scripts.build = packageJson.scripts.build.replace(
      'remix build',
      'remix build --sourcemap && sentry-upload-sourcemaps',
    );
  }

  await fs.promises.writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
  );
  /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
}

export async function initializeSentryOnEntryClientTsx(
  dsn: string,
): Promise<void> {
  const originalEntryClientTsx = path.join(
    process.cwd(),
    'app',
    'entry.client.tsx',
  );

  const originalEntryClientTsxMod = await loadFile(originalEntryClientTsx);

  if (
    hasSentryContent(originalEntryClientTsx, originalEntryClientTsxMod.$code)
  ) {
    // Bail out
    return;
  }

  originalEntryClientTsxMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  originalEntryClientTsxMod.imports.$add({
    from: 'react',
    imported: 'useEffect',
    local: 'useEffect',
  });

  originalEntryClientTsxMod.imports.$add({
    from: '@remix-run/react',
    imported: 'useLocation',
    local: 'useLocation',
  });

  originalEntryClientTsxMod.imports.$add({
    from: '@remix-run/react',
    imported: 'useMatches',
    local: 'useMatches',
  });

  insertClientInitCall(dsn, originalEntryClientTsxMod);

  await writeFile(
    originalEntryClientTsxMod.$ast,
    path.join(process.cwd(), 'app', 'entry.client.tsx'),
  );
}

export async function initializeSentryOnEntryServerTsx(
  dsn: string,
  isV2: boolean,
): Promise<void> {
  const originalEntryServerTsx = path.join(
    process.cwd(),
    'app',
    'entry.server.tsx',
  );

  const originalEntryServerTsxMod = await loadFile(originalEntryServerTsx);

  if (
    hasSentryContent(originalEntryServerTsx, originalEntryServerTsxMod.$code)
  ) {
    // Bail out
    return;
  }

  originalEntryServerTsxMod.imports.$add({
    from: '@sentry/remix',
    imported: '*',
    local: 'Sentry',
  });

  insertServerInitCall(dsn, originalEntryServerTsxMod);

  if (isV2) {
    instrumentHandleError(originalEntryServerTsxMod);
  }

  await writeFile(
    originalEntryServerTsxMod.$ast,
    path.join(process.cwd(), 'app', 'entry.server.tsx'),
  );
}
