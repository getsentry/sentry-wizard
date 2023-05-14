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


const VITE_CONFIG_FILE = 'vite.config.js';

export type PartialViteConfig = {
  vite?: {

  };
};


export async function createOrMergeViteFiles(
  dsn: string,
  viteConfig: PartialViteConfig,
): Promise<void> {
  const viteBundlerConfig = findHooksFile(path.resolve(process.cwd(), 'vite.config'));

  if (viteBundlerConfig) {
    await modifyViteConfig(viteBundlerConfig);
  }
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

/** Checks if the Sentry SvelteKit SDK is already mentioned in the file */
function hasSentryContent(fileName: string, fileContent: string): boolean {
  if (fileContent.includes('@sentry/vite-plugin')) {
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

export async function loadViteConfig(): Promise<PartialViteConfig> {
  const configFilePath = path.join(process.cwd(), VITE_CONFIG_FILE);

  try {
    if (!fs.existsSync(configFilePath)) {
      return {};
    }

    const configUrl = url.pathToFileURL(configFilePath).href;
    const viteConfigModule = (await import(configUrl)) as {
      default: PartialViteConfig;
    };

    return viteConfigModule?.default || {};
  } catch (e: unknown) {
    clack.log.error(`Couldn't load ${VITE_CONFIG_FILE}.
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
    imported: 'sentryVite',
    from: '@sentry/vite-plugin',
    constructor: 'sentryVite',
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
