import type { ExportNamedDeclaration, Program } from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

import * as Sentry from '@sentry/node';

//@ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile } from 'magicast';
import {
  getClientHooksTemplate,
  getInstrumentationServerTemplate,
  getServerHooksTemplate,
} from '../templates';
import {
  featureSelectionPrompt,
  isUsingTypeScript,
  showCopyPasteInstructions,
} from '../../utils/clack';
import { findFile, hasSentryContent } from '../../utils/ast-utils';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
import {
  enableTracingAndInstrumentation,
  type PartialBackwardsForwardsCompatibleSvelteConfig,
} from './svelte-config';
import { ProjectInfo } from './types';
import { modifyViteConfig } from './vite';
import { modifyAndRecordFail } from './utils';
import { debug } from '../../utils/debug';

export async function createOrMergeSvelteKitFiles(
  projectInfo: ProjectInfo,
  svelteConfig: PartialBackwardsForwardsCompatibleSvelteConfig,
  setupForSvelteKitTracing: boolean,
): Promise<void> {
  const selectedFeatures = await featureSelectionPrompt([
    {
      id: 'performance',
      prompt: `Do you want to enable ${chalk.bold(
        'Tracing',
      )} to track the performance of your application?`,
      enabledHint: 'recommended',
    },
    {
      id: 'replay',
      prompt: `Do you want to enable ${chalk.bold(
        'Session Replay',
      )} to get a video-like reproduction of errors during a user session?`,
      enabledHint: 'recommended, but increases bundle size',
    },
    {
      id: 'logs',
      prompt: `Do you want to enable ${chalk.bold(
        'Logs',
      )} to send your application logs to Sentry?`,
      enabledHint: 'recommended',
    },
  ] as const);

  const { clientHooksPath, serverHooksPath } = getHooksConfigDirs(svelteConfig);

  // full file paths with correct file ending (or undefined if not found)
  const originalClientHooksFile = findFile(clientHooksPath);
  const originalServerHooksFile = findFile(serverHooksPath);
  const originalInstrumentationServerFile = findFile(
    path.resolve(process.cwd(), 'src', 'instrumentation.server'),
  );

  const viteConfig = findFile(path.resolve(process.cwd(), 'vite.config'));

  const fileEnding = isUsingTypeScript() ? 'ts' : 'js';

  const { dsn } = projectInfo;

  if (setupForSvelteKitTracing) {
    await enableTracingAndInstrumentation(
      svelteConfig,
      selectedFeatures.performance,
    );

    try {
      if (!originalInstrumentationServerFile) {
        await createNewInstrumentationServerFile(dsn, selectedFeatures);
      } else {
        await mergeInstrumentationServerFile(
          originalInstrumentationServerFile,
          dsn,
          selectedFeatures,
        );
      }
    } catch (e) {
      clack.log.warn(
        `Failed to automatically set up ${chalk.cyan(
          `instrumentation.server.${
            fileEnding ?? isUsingTypeScript() ? 'ts' : 'js'
          }`,
        )}.`,
      );
      debug(e);

      await showCopyPasteInstructions({
        codeSnippet: getInstrumentationServerTemplate(dsn, selectedFeatures),
        filename: `instrumentation.server.${
          fileEnding ?? isUsingTypeScript() ? 'ts' : 'js'
        }`,
      });

      Sentry.setTag('created-instrumentation-server', 'fail');
    }
  }

  Sentry.setTag(
    'server-hooks-file-strategy',
    originalServerHooksFile ? 'merge' : 'create',
  );

  if (!originalServerHooksFile) {
    await createNewHooksFile(
      `${serverHooksPath}.${fileEnding}`,
      'server',
      dsn,
      selectedFeatures,
      !setupForSvelteKitTracing,
    );
  } else {
    await mergeHooksFile(
      originalServerHooksFile,
      'server',
      dsn,
      selectedFeatures,
      !setupForSvelteKitTracing,
    );
  }

  Sentry.setTag(
    'client-hooks-file-strategy',
    originalClientHooksFile ? 'merge' : 'create',
  );
  if (!originalClientHooksFile) {
    await createNewHooksFile(
      `${clientHooksPath}.${fileEnding}`,
      'client',
      dsn,
      selectedFeatures,
      true,
    );
  } else {
    await mergeHooksFile(
      originalClientHooksFile,
      'client',
      dsn,
      selectedFeatures,
      true,
    );
  }

  if (viteConfig) {
    await modifyViteConfig(viteConfig, projectInfo);
  }
}

/**
 * Attempts to read the svelte.config.js file to find the location of the hooks files.
 * If users specified a custom location, we'll use that. Otherwise, we'll use the default.
 */
function getHooksConfigDirs(
  svelteConfig: PartialBackwardsForwardsCompatibleSvelteConfig,
): {
  clientHooksPath: string;
  serverHooksPath: string;
} {
  const relativeUserClientHooksPath = svelteConfig?.kit?.files?.hooks?.client;
  const relativeUserServerHooksPath = svelteConfig?.kit?.files?.hooks?.server;
  const userClientHooksPath =
    relativeUserClientHooksPath &&
    path.resolve(process.cwd(), relativeUserClientHooksPath);
  const userServerHooksPath =
    relativeUserServerHooksPath &&
    path.resolve(process.cwd(), relativeUserServerHooksPath);

  const defaulHooksDir = path.resolve(process.cwd(), 'src');
  const defaultClientHooksPath = path.resolve(defaulHooksDir, 'hooks.client'); // file ending missing on purpose
  const defaultServerHooksPath = path.resolve(defaulHooksDir, 'hooks.server'); // same here

  return {
    clientHooksPath: userClientHooksPath || defaultClientHooksPath,
    serverHooksPath: userServerHooksPath || defaultServerHooksPath,
  };
}

/**
 * Reads the template, replaces the dsn placeholder with the actual dsn and writes the file to @param hooksFileDest
 */
async function createNewHooksFile(
  hooksFileDest: string,
  hooktype: 'client' | 'server',
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
  setupForSvelteKitTracing: boolean,
): Promise<void> {
  const filledTemplate =
    hooktype === 'client'
      ? getClientHooksTemplate(dsn, selectedFeatures)
      : getServerHooksTemplate(dsn, selectedFeatures, setupForSvelteKitTracing);

  await fs.promises.mkdir(path.dirname(hooksFileDest), { recursive: true });
  await fs.promises.writeFile(hooksFileDest, filledTemplate);

  clack.log.success(`Created ${hooksFileDest}`);
  Sentry.setTag(`created-${hooktype}-hooks`, 'success');
}

async function createNewInstrumentationServerFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    logs: boolean;
  },
): Promise<void> {
  const filledTemplate = getInstrumentationServerTemplate(
    dsn,
    selectedFeatures,
  );

  const fileEnding = isUsingTypeScript() ? 'ts' : 'js';

  const instrumentationServerFile = path.resolve(
    process.cwd(),
    'src',
    `instrumentation.server.${fileEnding}`,
  );

  await fs.promises.mkdir(path.dirname(instrumentationServerFile), {
    recursive: true,
  });

  await fs.promises.writeFile(instrumentationServerFile, filledTemplate);

  clack.log.success(
    `Created ${chalk.cyan(path.basename(instrumentationServerFile))}`,
  );
  Sentry.setTag('created-instrumentation-server', 'success');
}

/**
 * Merges the users' hooks file with Sentry-related code.
 *
 * Both hooks:
 * - add import * as Sentry
 * - add Sentry.init
 * - add handleError hook wrapper
 *
 * Additionally in  Server hook:
 * - add handle hook handler
 */
async function mergeHooksFile(
  hooksFile: string,
  hookType: 'client' | 'server',
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
  includeSentryInit: boolean,
): Promise<void> {
  const originalHooksMod = await loadFile(hooksFile);

  const file: 'server-hooks' | 'client-hooks' = `${hookType}-hooks`;

  if (hasSentryContent(originalHooksMod.$ast as t.Program)) {
    // We don't want to mess with files that already have Sentry content.
    // Let's just bail out at this point.
    clack.log.warn(
      `File ${chalk.cyan(
        path.basename(hooksFile),
      )} already contains Sentry code.
Skipping adding Sentry functionality to.`,
    );
    Sentry.setTag(`modified-${file}`, 'fail');
    Sentry.setTag(`${file}-fail-reason`, 'has-sentry-content');
    return;
  }

  await modifyAndRecordFail(
    () =>
      originalHooksMod.imports.$add({
        from: '@sentry/sveltekit',
        imported: '*',
        local: 'Sentry',
      }),
    'import-injection',
    file,
  );

  if (hookType === 'client' || includeSentryInit) {
    await modifyAndRecordFail(
      () => {
        if (hookType === 'client') {
          insertClientInitCall(dsn, originalHooksMod, selectedFeatures);
        } else {
          insertServerInitCall(dsn, originalHooksMod, selectedFeatures);
        }
      },
      'init-call-injection',
      file,
    );
  }

  await modifyAndRecordFail(
    () => wrapHandleError(originalHooksMod),
    'wrap-handle-error',
    file,
  );

  if (hookType === 'server') {
    await modifyAndRecordFail(
      () => wrapHandle(originalHooksMod),
      'wrap-handle',
      'server-hooks',
    );
  }

  await modifyAndRecordFail(
    async () => {
      const modifiedCode = originalHooksMod.generate().code;
      await fs.promises.writeFile(hooksFile, modifiedCode);
    },
    'write-file',
    file,
  );

  clack.log.success(`Added Sentry code to ${hooksFile}`);
  Sentry.setTag(`modified-${hookType}-hooks`, 'success');
}

/**
 * Merges the users' instrumentation.server file with Sentry-related code.
 *
 * Both hooks:
 * - add import * as Sentry
 * - add Sentry.init
 * - add handleError hook wrapper
 *
 * Additionally in  Server hook:
 * - add handle hook handler
 */
async function mergeInstrumentationServerFile(
  instrumentationServerFilePath: string,
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
): Promise<void> {
  const originalInstrumentationServerMod = await loadFile(
    instrumentationServerFilePath,
  );
  const filename = path.basename(instrumentationServerFilePath);

  if (hasSentryContent(originalInstrumentationServerMod.$ast as t.Program)) {
    // We don't want to mess with files that already have Sentry content.
    // Let's just bail out at this point.
    clack.log.warn(
      `File ${chalk.cyan(filename)} already contains Sentry code.
Skipping adding Sentry functionality to.`,
    );
    Sentry.setTag(`modified-instrumentation-server`, 'fail');
    Sentry.setTag(`instrumentation-server-fail-reason`, 'has-sentry-content');
    return;
  }

  await modifyAndRecordFail(
    () =>
      originalInstrumentationServerMod.imports.$add({
        from: '@sentry/sveltekit',
        imported: '*',
        local: 'Sentry',
      }),
    'import-injection',
    'instrumentation-server',
  );

  await modifyAndRecordFail(
    () => {
      insertServerInitCall(
        dsn,
        originalInstrumentationServerMod,
        selectedFeatures,
      );
    },
    'init-call-injection',
    'instrumentation-server',
  );

  await modifyAndRecordFail(
    async () => {
      const modifiedCode = originalInstrumentationServerMod.generate().code;
      await fs.promises.writeFile(instrumentationServerFilePath, modifiedCode);
    },
    'write-file',
    'instrumentation-server',
  );

  clack.log.success(`Added Sentry.init code to ${chalk.cyan(filename)}`);
  Sentry.setTag(`modified-instrumentation-server`, 'success');
}

function insertClientInitCall(
  dsn: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalHooksMod: ProxifiedModule<any>,
  selectedFeatures: {
    performance: boolean;
    replay: boolean;
    logs: boolean;
  },
): void {
  const initCallComment = `
    // If you don't want to use Session Replay, remove the \`Replay\` integration,
    // \`replaysSessionSampleRate\` and \`replaysOnErrorSampleRate\` options.`;

  const initArgs: {
    dsn: string;
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
    integrations?: string[];
    enableLogs?: boolean;
  } = {
    dsn,
  };

  if (selectedFeatures.performance) {
    initArgs.tracesSampleRate = 1.0;
  }

  if (selectedFeatures.replay) {
    initArgs.replaysSessionSampleRate = 0.1;
    initArgs.replaysOnErrorSampleRate = 1.0;
    initArgs.integrations = [builders.functionCall('Sentry.replayIntegration')];
  }

  if (selectedFeatures.logs) {
    initArgs.enableLogs = true;
  }

  // This assignment of any values is fine because we're just creating a function call in magicast
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCall = builders.functionCall('Sentry.init', initArgs);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCallWithComment = builders.raw(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    `${initCallComment}\n${generateCode(initCall).code}`,
  );

  const originalHooksModAST = originalHooksMod.$ast as Program;

  const initCallInsertionIndex = getInitCallInsertionIndex(originalHooksModAST);

  originalHooksModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCallWithComment).code,
  );
}

function insertServerInitCall(
  dsn: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalMod: ProxifiedModule<any>,
  selectedFeatures: {
    performance: boolean;
    logs: boolean;
  },
): void {
  const initArgs: {
    dsn: string;
    tracesSampleRate?: number;
    enableLogs?: boolean;
  } = {
    dsn,
  };

  if (selectedFeatures.performance) {
    initArgs.tracesSampleRate = 1.0;
  }

  if (selectedFeatures.logs) {
    initArgs.enableLogs = true;
  }

  // This assignment of any values is fine because we're just creating a function call in magicast
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCall = builders.functionCall('Sentry.init', initArgs);

  const originalModAST = originalMod.$ast as Program;

  const initCallInsertionIndex = getInitCallInsertionIndex(originalModAST);

  originalModAST.body.splice(
    initCallInsertionIndex,
    0,
    // @ts-expect-error - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCall).code,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapHandleError(mod: ProxifiedModule<any>): void {
  const modAst = mod.exports.$ast as Program;
  const namedExports = modAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  let foundHandleError = false;

  namedExports.forEach((modExport) => {
    const declaration = modExport.declaration;
    if (!declaration) {
      return;
    }
    if (declaration.type === 'FunctionDeclaration') {
      if (!declaration.id || declaration.id.name !== 'handleError') {
        return;
      }
      foundHandleError = true;
      const userCode = generateCode(declaration).code;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.handleError = builders.raw(
        `Sentry.handleErrorWithSentry(${userCode.replace(
          'handleError',
          '_handleError',
        )})`,
      );
      // because magicast doesn't overwrite the original function export, we need to remove it manually
      modAst.body = modAst.body.filter((node) => node !== modExport);
    } else if (declaration.type === 'VariableDeclaration') {
      const declarations = declaration.declarations;
      declarations.forEach((declaration) => {
        // @ts-expect-error - id should always have a name in this case
        if (!declaration.id || declaration.id.name !== 'handleError') {
          return;
        }
        foundHandleError = true;
        const userCode = declaration.init;
        const stringifiedUserCode = userCode ? generateCode(userCode).code : '';
        // @ts-expect-error - we can just place a string here, magicast will convert it to a node
        declaration.init = `Sentry.handleErrorWithSentry(${stringifiedUserCode})`;
      });
    }
  });

  if (!foundHandleError) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mod.exports.handleError = builders.functionCall(
      'Sentry.handleErrorWithSentry',
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapHandle(mod: ProxifiedModule<any>): void {
  const modAst = mod.exports.$ast as Program;
  const namedExports = modAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  let foundHandle = false;

  namedExports.forEach((modExport) => {
    const declaration = modExport.declaration;
    if (!declaration) {
      return;
    }
    if (declaration.type === 'FunctionDeclaration') {
      if (!declaration.id || declaration.id.name !== 'handle') {
        return;
      }
      foundHandle = true;
      const userCode = generateCode(declaration).code;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mod.exports.handle = builders.raw(
        `sequence(Sentry.sentryHandle(), ${userCode.replace(
          'handle',
          '_handle',
        )})`,
      );
      // because of an issue with magicast, we need to remove the original export
      modAst.body = modAst.body.filter((node) => node !== modExport);
    } else if (declaration.type === 'VariableDeclaration') {
      const declarations = declaration.declarations;
      declarations.forEach((declaration) => {
        if (
          !declaration.id ||
          declaration.id.type !== 'Identifier' ||
          (declaration.id.name && declaration.id.name !== 'handle')
        ) {
          return;
        }
        const userCode = declaration.init;
        const stringifiedUserCode = userCode ? generateCode(userCode).code : '';
        // @ts-expect-error - we can just place a string here, magicast will convert it to a node
        declaration.init = `sequence(Sentry.sentryHandle(), ${stringifiedUserCode})`;
        foundHandle = true;
      });
    }
  });

  if (!foundHandle) {
    // can't use builders.functionCall here because it doesn't yet
    // support member expressions (Sentry.sentryHandle()) in args
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mod.exports.handle = builders.raw('sequence(Sentry.sentryHandle())');
  }

  try {
    mod.imports.$add({
      from: '@sveltejs/kit/hooks',
      imported: 'sequence',
      local: 'sequence',
    });
  } catch (_) {
    // It's possible sequence is already imported. in this case, magicast throws but that's fine.
  }
}

/**
 * We want to insert the init call on top of the file but after all import statements
 */
function getInitCallInsertionIndex(originalModAST: Program): number {
  // We need to deep-copy here because reverse mutates in place
  const copiedBodyNodes = [...originalModAST.body];
  const lastImportDeclaration = copiedBodyNodes
    .reverse()
    .find((node) => node.type === 'ImportDeclaration');

  const initCallInsertionIndex = lastImportDeclaration
    ? originalModAST.body.indexOf(lastImportDeclaration) + 1
    : 0;
  return initCallInsertionIndex;
}
