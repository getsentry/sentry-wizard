import type { ExportNamedDeclaration, Program } from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import chalk from 'chalk';

// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, parseModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';
import {
  getClientHooksTemplate,
  getServerHooksTemplate,
} from '../templates/sveltekit-templates';

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

export async function createOrMergeSvelteKitFiles(
  dsn: string,
  svelteConfig: PartialSvelteConfig,
): Promise<void> {
  const { clientHooksPath, serverHooksPath } = getHooksConfigDirs(svelteConfig);

  // full file paths with correct file ending (or undefined if not found)
  const originalClientHooksFile = findHooksFile(clientHooksPath);
  const originalServerHooksFile = findHooksFile(serverHooksPath);

  const viteConfig = findHooksFile(path.resolve(process.cwd(), 'vite.config'));

  if (!originalClientHooksFile) {
    clack.log.info('No client hooks file found, creating a new one.');
    await createNewHooksFile(`${clientHooksPath}.js`, 'client', dsn);
  }
  if (!originalServerHooksFile) {
    clack.log.info('No server hooks file found, creating a new one.');
    await createNewHooksFile(`${serverHooksPath}.js`, 'server', dsn);
  }

  if (originalClientHooksFile) {
    await mergeHooksFile(originalClientHooksFile, 'client', dsn);
  }
  if (originalServerHooksFile) {
    await mergeHooksFile(originalServerHooksFile, 'server', dsn);
  }

  if (viteConfig) {
    await modifyViteConfig(viteConfig);
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
 * Checks if a hooks file exists and returns the full path to the file with the correct file type.
 */
function findHooksFile(hooksFile: string): string | undefined {
  const possibleFileTypes = ['.js', '.ts', '.mjs'];
  return possibleFileTypes
    .map((type) => `${hooksFile}${type}`)
    .find((file) => fs.existsSync(file));
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
  if (hasSentryContent(path.basename(hooksFile), originalHooksMod.$code)) {
    // We don't want to mess with files that already have Sentry content.
    // Let's just bail out at this point.
    return;
  }

  originalHooksMod.imports.$add({
    from: '@sentry/sveltekit',
    imported: '*',
    local: 'Sentry',
  });

  if (hookType === 'client') {
    insertClientInitCall(dsn, originalHooksMod);
  } else {
    insertServerInitCall(dsn, originalHooksMod);
  }

  wrapHandleError(originalHooksMod);

  if (hookType === 'server') {
    wrapHandle(originalHooksMod);
  }

  const modifiedCode = originalHooksMod.generate().code;

  await fs.promises.writeFile(hooksFile, modifiedCode);

  clack.log.success(`Added Sentry code to ${hooksFile}`);
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

/** Checks if the Sentry SvelteKit SDK is already mentioned in the file */
function hasSentryContent(fileName: string, fileContent: string): boolean {
  if (fileContent.includes('@sentry/sveltekit')) {
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

async function modifyViteConfig(viteConfigPath: string): Promise<void> {
  const viteConfigContent = (
    await fs.promises.readFile(viteConfigPath, 'utf-8')
  ).toString();

  if (hasSentryContent(viteConfigPath, viteConfigContent)) {
    return;
  }

  const viteModule = parseModule(viteConfigContent);

  addVitePlugin(viteModule, {
    imported: 'sentrySvelteKit',
    from: '@sentry/sveltekit',
    constructor: 'sentrySvelteKit',
    index: 0,
  });

  const code = generateCode(viteModule.$ast).code;
  await fs.promises.writeFile(viteConfigPath, code);
}

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
