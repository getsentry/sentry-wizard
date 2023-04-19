import { info } from 'console';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as path from 'path';

import type { Args } from '../../Constants';
import { nl } from '../../Helper/Logging';
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
    info('Setting up SvelteKit SDK');

    // const dsn = answers.config?.dsn?.public || null;
    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    await this._sentryCli.createSentryCliConfig(sentryCliProps);

    // TODO: The actual SDK setup

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
}
