/* eslint-disable max-lines */
import type { ExportNamedDeclaration, Program } from '@babel/types';
import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { builders, generateCode, loadFile, parseModule } from 'magicast';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { addVitePlugin } from 'magicast/helpers';
import * as path from 'path';
import * as url from 'url';

import type { Args } from '../../Constants';
import { dim, green, l, nl, red, yellow } from '../../Helper/Logging';
import { checkPackageVersion, hasPackageInstalled } from '../../Helper/Package';
import { getPackageManagerChoice } from '../../Helper/PackageManager';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const SVELTEKIT_SDK_PACKAGE = '@sentry/sveltekit';
const COMPATIBLE_SVELTEKIT_VERSIONS = '>=1.0.0';
const COMPATIBLE_SDK_VERSIONS = '>=7.48.0';

const SVELTEKIT_TEMPLATES_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'SvelteKit',
);

const DEFAULT_CLIENT_HOOKS_BASENAME = 'hooks.client.js';
const DEFAULT_SERVER_HOOKS_BASENAME = 'hooks.server.js';

const SVELTE_CONFIG_FILE = 'svelte.config.js';

let appPackage: any = {};

try {
  appPackage = require(path.join(process.cwd(), 'package.json'));
} catch {
  // We don't need to have this
}

export class SvelteKit extends BaseIntegration {
  private _sentryCli: SentryCli;
  public constructor(protected _argv: Args) {
    super(_argv);
    this._sentryCli = new SentryCli(this._argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    nl();
    l('Setting up the Sentry SvelteKit SDK');

    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    await this._sentryCli.createSentryCliConfig(sentryCliProps);

    const dsn = answers?.config?.dsn?.public;
    try {
      await this._createOrMergeSvelteKitFiles(dsn);
    } catch (e) {
      red('Error while setting up SvelteKit SDK:');
      dim(e);
    }

    nl();
    green('✓ Successfully installed the Sentry SvelteKit SDK!');
    l('Check out the SDK documentation for further configuration:');
    l(
      'https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md',
    );
    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    await this._createOrMergeSvelteKitFiles('somedes');

    nl();

    let userAnswers: Answers = { continue: true };
    const hasCompatibleSvelteKitVersion = checkPackageVersion(
      appPackage,
      '@sveltejs/kit',
      COMPATIBLE_SVELTEKIT_VERSIONS,
      true,
    );

    const packageManager = getPackageManagerChoice();
    const hasSdkInstalled = hasPackageInstalled(
      appPackage,
      SVELTEKIT_SDK_PACKAGE,
    );

    let hasCompatibleSdkVersion = false;
    // if no SDK is installed but SvelteKit was detected, let's add the SDK if we can
    if (!hasSdkInstalled && packageManager && hasCompatibleSvelteKitVersion) {
      await packageManager.installPackage(SVELTEKIT_SDK_PACKAGE);
      // can assume it's compatible since we just installed it
      hasCompatibleSdkVersion = true;
    } else {
      // otherwise, let's check the version and spit out the appropriate error
      hasCompatibleSdkVersion = checkPackageVersion(
        appPackage,
        SVELTEKIT_SDK_PACKAGE,
        COMPATIBLE_SDK_VERSIONS,
        true,
      );
    }
    const hasAllPackagesCompatible =
      hasCompatibleSvelteKitVersion && hasCompatibleSdkVersion;

    if (!hasAllPackagesCompatible && !this._argv.quiet) {
      userAnswers = await prompt({
        message:
          'There were errors while checking your project config. Do you still want to continue?',
        name: 'continue',
        default: false,
        type: 'confirm',
      });
    }

    nl();

    if (!userAnswers['continue']) {
      throw new Error('Please install the required dependencies to continue.');
    }

    this._shouldConfigure = Promise.resolve({ sveltekit: true });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return this.shouldConfigure;
  }

  private async _createOrMergeSvelteKitFiles(dsn: string): Promise<void> {
    const { clientHooksPath, serverHooksPath } =
      await this._getHooksConfigDirs();

    // full file paths with correct file ending (or undefined if not found)
    const originalClientHooksFile = this._findHooksFile(clientHooksPath);
    const originalServerHooksFile = this._findHooksFile(serverHooksPath);

    const viteConfig = this._findHooksFile(
      path.resolve(process.cwd(), 'vite.config'),
    );

    if (!originalClientHooksFile) {
      dim('No client hooks file found, creating a new one.');
      await this._createNewHooksFile(
        `${clientHooksPath}.js`,
        DEFAULT_CLIENT_HOOKS_BASENAME,
        dsn,
      );
    }
    if (!originalServerHooksFile) {
      dim('No server hook file found, creating a new one.');
      await this._createNewHooksFile(
        `${serverHooksPath}.js`,
        DEFAULT_SERVER_HOOKS_BASENAME,
        dsn,
      );
    }

    if (originalClientHooksFile) {
      await this._mergeHooksFile(originalClientHooksFile, 'client', dsn);
    }
    if (originalServerHooksFile) {
      await this._mergeHooksFile(originalServerHooksFile, 'server', dsn);
    }

    if (viteConfig) {
      await this._modifyViteConfig(viteConfig);
    }
  }

  /**
   * Attempts to read the svelte.config.js file to find the location of the hooks files.
   * If users specified a custom location, we'll use that. Otherwise, we'll use the default.
   */
  private async _getHooksConfigDirs(): Promise<{
    clientHooksPath: string;
    serverHooksPath: string;
  }> {
    const svelteConfig = await this._loadSvelteConfig();
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
  private _findHooksFile(hooksFile: string): string | undefined {
    const possibleFileTypes = ['.js', '.ts', '.mjs'];
    return possibleFileTypes
      .map((type) => `${hooksFile}${type}`)
      .find((file) => fs.existsSync(file));
  }

  /**
   * Reads the template, replaces the dsn placeholder with the actual dsn and writes the file to @param hooksFileDest
   */
  private async _createNewHooksFile(
    hooksFileDest: string,
    templateFileName: string,
    dsn: string,
  ): Promise<void> {
    const templateDir = path.resolve(SVELTEKIT_TEMPLATES_DIR, 'hooks');
    const templateFile = path.resolve(templateDir, templateFileName);
    const templateContent = (
      await fs.promises.readFile(templateFile, 'utf-8')
    ).toString();
    const filledTemplate = templateContent.replace('___DSN___', dsn);

    await fs.promises.mkdir(path.dirname(hooksFileDest), { recursive: true });
    await fs.promises.writeFile(hooksFileDest, filledTemplate);

    green(`✓ Created ${hooksFileDest}`);
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
  private async _mergeHooksFile(
    hooksFile: string,
    hookType: 'client' | 'server',
    dsn: string,
  ): Promise<void> {
    const originalHooksMod = await loadFile(hooksFile);
    if (
      this._hasSentryContent(path.basename(hooksFile), originalHooksMod.$code)
    ) {
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
      this._insertClientInitCall(dsn, originalHooksMod);
    } else {
      this._insertServerInitCall(dsn, originalHooksMod);
    }

    this._wrapHandleError(originalHooksMod);

    if (hookType === 'server') {
      this._wrapHandle(originalHooksMod);
    }

    const modifiedCode = originalHooksMod.generate().code;

    await fs.promises.writeFile(hooksFile, modifiedCode);

    green(`✓ Added Sentry code to ${hooksFile}`);
  }

  private _insertClientInitCall(
    dsn: string,
    originalHooksMod: ProxifiedModule<any>,
  ): void {
    const initCallComment = `
    // If you don't want to use Session Replay, remove the \`Replay\` integration, 
    // \`replaysSessionSampleRate\` and \`replaysOnErrorSampleRate\` options.`;
    const initCall = builders.functionCall('Sentry.init', {
      dsn,
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [builders.newExpression('Sentry.Replay')],
    });

    const initCallWithComment = builders.raw(
      `${initCallComment}\n${generateCode(initCall).code}`,
    );

    const originalHooksModAST = originalHooksMod.$ast as Program;

    const initCallInsertionIndex =
      getInitCallInsertionIndex(originalHooksModAST);

    originalHooksModAST.body.splice(
      initCallInsertionIndex,
      0,
      // @ts-ignore - string works here because the AST is proxified by magicast
      generateCode(initCallWithComment).code,
    );
  }

  private _insertServerInitCall(
    dsn: string,
    originalHooksMod: ProxifiedModule<any>,
  ): void {
    const initCall = builders.functionCall('Sentry.init', {
      dsn,
      tracesSampleRate: 1.0,
    });

    const originalHooksModAST = originalHooksMod.$ast as Program;

    const initCallInsertionIndex =
      getInitCallInsertionIndex(originalHooksModAST);

    originalHooksModAST.body.splice(
      initCallInsertionIndex,
      0,
      // @ts-ignore - string works here because the AST is proxified by magicast
      generateCode(initCall).code,
    );
  }

  private _wrapHandleError(mod: ProxifiedModule<any>): void {
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
          const stringifiedUserCode = userCode
            ? generateCode(userCode).code
            : '';
          // @ts-ignore - we can just place a string here, magicast will convert it to a node
          declaration.init = `Sentry.handleErrorWithSentry(${stringifiedUserCode})`;
        });
      }
    });

    if (!foundHandleError) {
      mod.exports.handleError = builders.functionCall(
        'Sentry.handleErrorWithSentry',
      );
    }
  }

  private _wrapHandle(mod: ProxifiedModule<any>): void {
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
        mod.exports.handle = builders.raw(
          `sequence(Sentry.sentryHandle, ${userCode.replace(
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
          const stringifiedUserCode = userCode
            ? generateCode(userCode).code
            : '';
          // @ts-ignore - we can just place a string here, magicast will convert it to a node
          declaration.init = `sequence(Sentry.sentryHandle, ${stringifiedUserCode})`;
          foundHandle = true;
        });
      }
    });

    if (!foundHandle) {
      // can't use builders.functionCall here because it doesn't yet
      // support member expressions (Sentry.sentryHandle) in args
      mod.exports.handle = builders.raw('sequence(Sentry.sentryHandle)');
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
  private _hasSentryContent(fileName: string, fileContent: string): boolean {
    if (fileContent.includes('@sentry/sveltekit')) {
      dim(
        `File ${path.basename(
          fileName,
        )} already contains '@sentry/sveltekit' code.`,
      );
      yellow(
        `⚠ Skipping adding Sentry functionality to ${path.basename(fileName)}.`,
      );
      return true;
    }
    return false;
  }

  private async _loadSvelteConfig(): Promise<Record<string, any>> {
    const configFilePath = path.join(process.cwd(), SVELTE_CONFIG_FILE);

    try {
      if (!fs.existsSync(configFilePath)) {
        return {};
      }

      const configUrl = url.pathToFileURL(configFilePath).href;
      const svelteConfigModule = await import(configUrl);

      return (svelteConfigModule?.default as Record<string, any>) || {};
    } catch (e) {
      red(`Couldn't load ${SVELTE_CONFIG_FILE}.`);
      l("Please make sure, you're running this wizard with Node 16 or newer");
      dim(e);

      return {};
    }
  }

  private async _modifyViteConfig(viteConfigPath: string): Promise<void> {
    const viteConfigContent = (
      await fs.promises.readFile(viteConfigPath, 'utf-8')
    ).toString();

    if (this._hasSentryContent(viteConfigPath, viteConfigContent)) {
      return;
    }

    const viteModule = parseModule(viteConfigContent);

    addVitePlugin(viteModule, {
      imported: 'sentrySvelteKit',
      from: '@sentry/sveltekit',
      constructor: 'sentrySvelteKit',
    });

    const code = generateCode(viteModule.$ast).code;
    await fs.promises.writeFile(viteConfigPath, code);
  }
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
