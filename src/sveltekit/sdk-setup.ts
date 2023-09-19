import type { ExportNamedDeclaration, Program } from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import chalk from 'chalk';

import * as Sentry from '@sentry/node';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, parseModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';
import { getClientHooksTemplate, getServerHooksTemplate } from './templates';
import { abortIfCancelled, isUsingTypeScript } from '../utils/clack-utils';
import { debug } from '../utils/debug';
import { findFile, hasSentryContent } from '../utils/ast-utils';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
import { traceStep } from '../telemetry';

const SVELTE_CONFIG_FILE = 'svelte.config.js';

export type PartialSvelteConfig = {
  kit?: {
    files?: {
      hooks?: {
        client?: string;
        server?: string;
      };
      routes?: string;
    };
  };
};

type ProjectInfo = {
  dsn: string;
  org: string;
  project: string;
  selfHosted: boolean;
  url: string;
};

export async function createOrMergeSvelteKitFiles(
  projectInfo: ProjectInfo,
  svelteConfig: PartialSvelteConfig,
): Promise<void> {
  const { clientHooksPath, serverHooksPath } = getHooksConfigDirs(svelteConfig);

  // full file paths with correct file ending (or undefined if not found)
  const originalClientHooksFile = findFile(clientHooksPath);
  const originalServerHooksFile = findFile(serverHooksPath);

  const viteConfig = findFile(path.resolve(process.cwd(), 'vite.config'));

  const fileEnding = isUsingTypeScript() ? 'ts' : 'js';

  const { dsn } = projectInfo;

  Sentry.setTag(
    'client-hooks-file-strategy',
    originalClientHooksFile ? 'merge' : 'create',
  );
  if (!originalClientHooksFile) {
    clack.log.info('No client hooks file found, creating a new one.');
    await createNewHooksFile(`${clientHooksPath}.${fileEnding}`, 'client', dsn);
  } else {
    await mergeHooksFile(originalClientHooksFile, 'client', dsn);
  }

  Sentry.setTag(
    'server-hooks-file-strategy',
    originalServerHooksFile ? 'merge' : 'create',
  );
  if (!originalServerHooksFile) {
    clack.log.info('No server hooks file found, creating a new one.');
    await createNewHooksFile(`${serverHooksPath}.${fileEnding}`, 'server', dsn);
  } else {
    await mergeHooksFile(originalServerHooksFile, 'server', dsn);
  }

  if (viteConfig) {
    await modifyViteConfig(viteConfig, projectInfo);
  }
}

/**
 * Attempts to read the svelte.config.js file to find the location of the hooks files.
 * If users specified a custom location, we'll use that. Otherwise, we'll use the default.
 */
function getHooksConfigDirs(svelteConfig: PartialSvelteConfig): {
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
): Promise<void> {
  const filledTemplate =
    hooktype === 'client'
      ? getClientHooksTemplate(dsn)
      : getServerHooksTemplate(dsn);

  await fs.promises.mkdir(path.dirname(hooksFileDest), { recursive: true });
  await fs.promises.writeFile(hooksFileDest, filledTemplate);

  clack.log.success(`Created ${hooksFileDest}`);
  Sentry.setTag(`created-${hooktype}-hooks`, 'success');
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

  await modifyAndRecordFail(
    () => {
      if (hookType === 'client') {
        insertClientInitCall(dsn, originalHooksMod);
      } else {
        insertServerInitCall(dsn, originalHooksMod);
      }
    },
    'init-call-injection',
    file,
  );

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

function insertClientInitCall(
  dsn: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalHooksMod: ProxifiedModule<any>,
): void {
  const initCallComment = `
    // If you don't want to use Session Replay, remove the \`Replay\` integration, 
    // \`replaysSessionSampleRate\` and \`replaysOnErrorSampleRate\` options.`;

  // This assignment of any values is fine because we're just creating a function call in magicast
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const initCall = builders.functionCall('Sentry.init', {
    dsn,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [builders.newExpression('Sentry.Replay')],
  });

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
    // @ts-ignore - string works here because the AST is proxified by magicast
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generateCode(initCallWithComment).code,
  );
}

function insertServerInitCall(
  dsn: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalHooksMod: ProxifiedModule<any>,
): void {
  // This assignment of any values is fine because we're just creating a function call in magicast
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
        // @ts-ignore - id should always have a name in this case
        if (!declaration.id || declaration.id.name !== 'handleError') {
          return;
        }
        foundHandleError = true;
        const userCode = declaration.init;
        const stringifiedUserCode = userCode ? generateCode(userCode).code : '';
        // @ts-ignore - we can just place a string here, magicast will convert it to a node
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
        // @ts-ignore - id should always have a name in this case
        if (!declaration.id || declaration.id.name !== 'handle') {
          return;
        }
        const userCode = declaration.init;
        const stringifiedUserCode = userCode ? generateCode(userCode).code : '';
        // @ts-ignore - we can just place a string here, magicast will convert it to a node
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

export async function loadSvelteConfig(): Promise<PartialSvelteConfig> {
  const configFilePath = path.join(process.cwd(), SVELTE_CONFIG_FILE);

  try {
    if (!fs.existsSync(configFilePath)) {
      return {};
    }

    const configUrl = url.pathToFileURL(configFilePath).href;
    const svelteConfigModule = (await import(configUrl)) as {
      default: PartialSvelteConfig;
    };

    return svelteConfigModule?.default || {};
  } catch (e: unknown) {
    clack.log.error(`Couldn't load ${SVELTE_CONFIG_FILE}.
Please make sure, you're running this wizard with Node 16 or newer`);
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

async function modifyViteConfig(
  viteConfigPath: string,
  projectInfo: ProjectInfo,
): Promise<void> {
  const viteConfigContent = (
    await fs.promises.readFile(viteConfigPath, 'utf-8')
  ).toString();

  const { org, project, url, selfHosted } = projectInfo;

  const prettyViteConfigFilename = chalk.cyan(path.basename(viteConfigPath));

  try {
    const viteModule = parseModule(viteConfigContent);

    if (hasSentryContent(viteModule.$ast as t.Program)) {
      clack.log.warn(
        `File ${prettyViteConfigFilename} already contains Sentry code.
Skipping adding Sentry functionality to.`,
      );
      Sentry.setTag(`modified-vite-cfg`, 'fail');
      Sentry.setTag(`vite-cfg-fail-reason`, 'has-sentry-content');
      return;
    }

    await modifyAndRecordFail(
      () =>
        addVitePlugin(viteModule, {
          imported: 'sentrySvelteKit',
          from: '@sentry/sveltekit',
          constructor: 'sentrySvelteKit',
          options: {
            sourceMapsUploadOptions: {
              org,
              project,
              ...(selfHosted && { url }),
            },
          },
          index: 0,
        }),
      'add-vite-plugin',
      'vite-cfg',
    );

    await modifyAndRecordFail(
      async () => {
        const code = generateCode(viteModule.$ast).code;
        await fs.promises.writeFile(viteConfigPath, code);
      },
      'write-file',
      'vite-cfg',
    );
  } catch (e) {
    debug(e);
    await showFallbackViteCopyPasteSnippet(
      viteConfigPath,
      getViteConfigCodeSnippet(org, project, selfHosted, url),
    );
    Sentry.captureException('Sveltekit Vite Config Modification Fail');
  }

  clack.log.success(`Added Sentry code to ${prettyViteConfigFilename}`);
  Sentry.setTag(`modified-vite-cfg`, 'success');
}

async function showFallbackViteCopyPasteSnippet(
  viteConfigPath: string,
  codeSnippet: string,
) {
  const viteConfigFilename = path.basename(viteConfigPath);

  clack.log.warning(
    `Couldn't automatically modify your ${chalk.cyan(viteConfigFilename)}
${chalk.dim(`This sometimes happens when we encounter more complex vite configs.
It may not seem like it but sometimes our magical powers are limited ;)`)}`,
  );

  clack.log.info("But don't worry - it's super easy to do this yourself!");

  clack.log.step(
    `Add the following code to your ${chalk.cyan(viteConfigFilename)}:`,
  );

  // Intentionally logging to console here for easier copy/pasting
  // eslint-disable-next-line no-console
  console.log(codeSnippet);

  await abortIfCancelled(
    clack.select({
      message: 'Did you copy the snippet above?',
      options: [
        { label: 'Yes!', value: true, hint: "Great, that's already it!" },
      ],
      initialValue: true,
    }),
  );
}

const getViteConfigCodeSnippet = (
  org: string,
  project: string,
  selfHosted: boolean,
  url: string,
) =>
  chalk.gray(`
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
${chalk.greenBright("import { sentrySvelteKit } from '@sentry/sveltekit'")}

export default defineConfig({
  plugins: [
    // Make sure \`sentrySvelteKit\` is registered before \`sveltekit\`
    ${chalk.greenBright(`sentrySvelteKit({
      sourceMapsUploadOptions: {
        org: '${org}',
        project: '${project}',${selfHosted ? `\n        url: '${url}',` : ''}
      }  
    }),`)}
    sveltekit(),
  ]
});
`);

/**
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

/**
 * Applies the @param modifyCallback and records Sentry tags if the call failed.
 * In case of a failure, a tag is set with @param reason as a fail reason
 * and the error is rethrown.
 */
async function modifyAndRecordFail<T>(
  modifyCallback: () => T | Promise<T>,
  reason: string,
  fileType: 'server-hooks' | 'client-hooks' | 'vite-cfg',
): Promise<void> {
  try {
    await traceStep(`${fileType}-${reason}`, modifyCallback);
  } catch (e) {
    Sentry.setTag(`modified-${fileType}`, 'fail');
    Sentry.setTag(`${fileType}-mod-fail-reason`, reason);
    throw e;
  }
}
