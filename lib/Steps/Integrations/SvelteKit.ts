import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as path from 'path';

import type { Args } from '../../Constants';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { checkPackageVersion, hasPackageInstalled } from '../../Helper/Package';
import { getPackageManagerChoice } from '../../Helper/PackageManager';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const SVELTEKIT_SDK_PACKAGE = '@sentry/sveltekit';
const COMPATIBLE_SVELTEKIT_VERSIONS = '>=1.0.0';
const COMPATIBLE_SDK_VERSIONS = '>=7.48.0';

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
    l('Setting up SvelteKit SDK');

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
    const clientHooksFile = this._findHooksFile(clientHooksPath);
    const serverHooksFile = this._findHooksFile(serverHooksPath);

    if (!clientHooksFile) {
      dim('No client hooks file found, creating a new one.');
      await this._createNewHooksFile(
        `${clientHooksPath}.js`,
        'hooks.client.js',
        dsn,
      );
    }
    if (!serverHooksFile) {
      dim('No server hook file found, creating a new one.');
      await this._createNewHooksFile(
        `${serverHooksPath}.js`,
        'hooks.server.js',
        dsn,
      );
    }

    if (clientHooksFile) {
      await this._mergeHooksFile(clientHooksFile, dsn);
    }
    if (serverHooksFile) {
      await this._mergeHooksFile(serverHooksFile, dsn);
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
    const templateDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'SvelteKit',
      'hooks',
    );
    const templateFile = path.resolve(templateDir, templateFileName);
    const templateContent = (
      await fs.promises.readFile(templateFile, 'utf-8')
    ).toString();
    const filledTemplate = templateContent.replace('___DSN___', dsn);

    await fs.promises.mkdir(path.dirname(hooksFileDest), { recursive: true });
    await fs.promises.writeFile(hooksFileDest, filledTemplate);

    green(`✓ Created ${hooksFileDest}`);
  }

  private async _mergeHooksFile(hooksFile: string, dsn: string): Promise<void> {
    // const originalHooksFileContent = (
    //   await fs.promises.readFile(hooksFile)
    // ).toString();
  }
}
