/* eslint-disable max-lines */
import chalk from 'chalk';
import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as path from 'path';

import type { Args } from '../../Constants';
import { cyan, dim, green, l, nl, red, yellow } from '../../Helper/Logging';
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

    // const dsn = answers.config?.dsn?.public || null;
    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    await this._sentryCli.createSentryCliConfig(sentryCliProps);

    const dsn = answers?.config?.dsn?.public;
    try {
      await this._createOrMergeHooksFiles(dsn);
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
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

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

  private async _createOrMergeHooksFiles(dsn: string): Promise<void> {
    // TODO: read directrory and file name of hooks from svelte.config.js
    const hooksDir = path.resolve(process.cwd(), 'src');
    const clientHooksPath = path.resolve(hooksDir, 'hooks.client'); // file ending missing on purpose
    const serverHooksPath = path.resolve(hooksDir, 'hooks.server'); // same here

    // full file paths with correct file ending (or undefined if not found)
    const originalClientHooksFile = this._findHooksFile(clientHooksPath);
    const originalServerHooksFile = this._findHooksFile(serverHooksPath);

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

    const finalClientHooksFile =
      (originalClientHooksFile && path.basename(originalClientHooksFile)) ||
      DEFAULT_CLIENT_HOOKS_BASENAME;
    const finalServerHooksFile =
      (originalServerHooksFile && path.basename(originalServerHooksFile)) ||
      DEFAULT_SERVER_HOOKS_BASENAME;

    await this._completeManualSteps(
      finalClientHooksFile,
      finalServerHooksFile,
      {
        client: !!originalClientHooksFile,
        server: !!originalServerHooksFile,
        vite: true,
      },
    );
  }

  private async _completeManualSteps(
    clientHooksFile: string,
    serverHooksFile: string,
    showSteps: {
      client: boolean;
      server: boolean;
      vite: boolean;
    },
  ): Promise<void> {
    async function userConfirm(): Promise<void> {
      await prompt([
        {
          name: 'manual step',
          type: 'input',
          message: `✓ I did it!`,
        },
      ]);
      currentStep += 1;
    }

    const { client, server, vite } = showSteps;
    const sumSteps: number =
      (client ? 1 : 0) + (server ? 2 : 0) + (vite ? 1 : 0);
    let currentStep = 1;

    if (client || server || vite) {
      nl();
      l('Almost done! Just a couple of manual steps left to do:');
      dim(
        'If you already set up Sentry, please skip the steps that you already performed.',
      );
    }

    if (client) {
      nl();
      l(
        `[${currentStep}/${sumSteps}] Add the Sentry error handler to ${chalk.yellow(
          clientHooksFile,
        )}:`,
      );
      nl();
      cyan(`export const handleError = Sentry.handleErrorWithSentry();`);
      nl();
      await userConfirm();
    }

    if (server) {
      nl();
      l(
        `[${currentStep}/${sumSteps}] Add the Sentry error handler to ${chalk.yellow(
          serverHooksFile,
        )}:`,
      );
      nl();
      cyan(`export const handleError = Sentry.handleErrorWithSentry();`);
      nl();
      await userConfirm();

      nl();
      l(
        `[${currentStep}/${sumSteps}] Add the Sentry request handler to ${chalk.yellow(
          serverHooksFile,
        )}:\n`,
      );
      cyan(`export const handle = sequence(Sentry.sentryHandle);`);
      nl();
      await userConfirm();
    }

    if (vite) {
      nl();
      l(
        `[${currentStep}/${sumSteps}] Add the Sentry Vite plugins to your ${chalk.yellow(
          'vite.config.js',
        )}:\n`,
      );
      cyan(`import { sentrySvelteKit } from '@sentry/nextjs';

export default defineConfig({
  plugins: [sentrySvelteKit(), sveltekit()]
});`);
      nl();

      await userConfirm();
    }
  }

  /**
   * Checks if a hooks file exists and returns the full path to the file with the correct file type.
   */
  private _findHooksFile(hooksFile: string): string | undefined {
    const possibleFileTypes = ['.js', '.ts', '.mjs'];
    return possibleFileTypes
      .map(type => `${hooksFile}${type}`)
      .find(file => fs.existsSync(file));
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
   * Merges the users' hooks file with Sentry's import and init call.
   * The init call is placed under the last import statement.
   *
   * Additional Sentry instrumentation needs to be performed manually for the moment.
   */
  private async _mergeHooksFile(
    hooksFile: string,
    hookType: 'client' | 'server',
    dsn: string,
  ): Promise<void> {
    const originalHooksFile = await (
      await fs.promises.readFile(hooksFile, 'utf-8')
    ).toString();

    if (this._hasSentryContent(path.basename(hooksFile), originalHooksFile)) {
      // We don't want to mess with files that already have Sentry content.
      // Let's just bail out at this point.
      return;
    }

    const initTemplate = await this._getPartialTemplate(
      `hooks.init.${hookType}.js`,
    );

    const filledInitTemplate = initTemplate.replace('___DSN___', dsn);

    // place the  import and init call directly under the last import:
    const hooksFileWithInit = originalHooksFile.replace(
      /^(?:[\s\S]*\n)?import .*(?:\r?\n|\r)/gm,
      match => `${match}\n${filledInitTemplate}\n`,
    );

    await fs.promises.writeFile(hooksFile, hooksFileWithInit);

    green(`✓ Added \`Sentry.init\` to ${hooksFile}`);
  }

  /** Reads the content of @param templateFile */
  private async _getPartialTemplate(templateFileName: string): Promise<string> {
    const templateDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'SvelteKit',
      'parts',
    );

    const templatePath = path.resolve(templateDir, templateFileName);

    return (await fs.promises.readFile(templatePath, 'utf-8')).toString();
  }

  /** Checks if the Sentry SvelteKit SDK is already mentioned in the file */
  private _hasSentryContent(fileName: string, fileContent: string): boolean {
    if (fileContent.includes('@sentry/sveltekit')) {
      dim(
        `Hooks file ${path.basename(
          fileName,
        )} already contains '@sentry/sveltekit' code.`,
      );
      yellow(`⚠ Skipping intializing Sentry in ${path.basename(fileName)}.`);
      return true;
    }
    return false;
  }
}
