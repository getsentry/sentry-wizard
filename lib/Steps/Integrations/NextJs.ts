import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { clean, gte, minVersion, satisfies, validRange } from 'semver';

import { Args } from '../../Constants';
import { debug, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_NEXTJS_VERSION = '10.0.8'; // Must be a fixed version: `X.Y.Z`
const PROPERTIES_FILENAME = 'sentry.properties';
const CONFIG_DIR = 'configs/';
const MERGEABLE_CONFIG_PREFIX = '_';

let appPackage: any = {};

try {
  appPackage = require(path.join(process.cwd(), 'package.json'));
} catch {
  // We don't need to have this
}

export class NextJs extends BaseIntegration {
  protected _sentryCli: SentryCli;

  constructor(protected _argv: Args) {
    super(_argv);
    this._sentryCli = new SentryCli(this._argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, ['config', 'dsn', 'public'], null);
    nl();

    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    fs.writeFileSync(
      `./${PROPERTIES_FILENAME}`,
      this._sentryCli.dumpProperties(sentryCliProps),
    );
    green(`Successfully created sentry.properties`);
    nl();

    const configDirectory = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'NextJs',
      CONFIG_DIR,
    );

    if (fs.existsSync(configDirectory)) {
      this._createNextConfig(configDirectory, dsn);
    } else {
      debug(
        `Couldn't find ${configDirectory}, probably because you run from src`,
      );
      nl();
    }

    l(
      'For more information, see https://docs.sentry.io/platforms/javascript/guides/nextjs/',
    );
    nl();

    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    nl();

    let userAnswers: Answers = { continue: true };
    if (!this._checkDep('next', true) && !this._argv.quiet) {
      userAnswers = await prompt({
        message:
          'There were errors during your project checkup, do you still want to continue?',
        name: 'continue',
        default: false,
        type: 'confirm',
      });
    }

    nl();

    if (!userAnswers['continue']) {
      throw new Error('Please install the required dependencies to continue.');
    }

    this._shouldConfigure = Promise.resolve({ nextjs: true });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return this.shouldConfigure;
  }

  private _createNextConfig(configDirectory: string, dsn: any): void {
    const templates = fs.readdirSync(configDirectory);
    for (const template of templates) {
      this._setTemplate(configDirectory, template, dsn);
    }
    red(
      '⚠ Performance monitoring is enabled capturing 100% of transactions.\n' +
        '  Learn more in https://docs.sentry.io/product/performance/',
    );
    nl();
  }

  private _setTemplate(
    configDirectory: string,
    template: string,
    dsn: string,
  ): void {
    const templatePath = path.join(configDirectory, template);
    const mergeableFile = MERGEABLE_CONFIG_PREFIX + template;
    if (!fs.existsSync(template)) {
      this._fillAndCopyTemplate(templatePath, template, dsn);
    } else if (!fs.existsSync(mergeableFile)) {
      this._fillAndCopyTemplate(templatePath, mergeableFile, dsn);
      red(
        `File ${template} already exists, so created ${mergeableFile}.\n` +
          `Please, merge those files.`,
      );
      nl();
    } else {
      red(
        `File ${template} already exists, and ${mergeableFile} also exists.\n` +
          'Please, merge those files.',
      );
      nl();
    }
  }

  private _fillAndCopyTemplate(
    sourcePath: string,
    targetPath: string,
    dsn: string,
  ): void {
    const templateContent = fs.readFileSync(sourcePath).toString();
    const filledTemplate = templateContent.replace('___DSN___', dsn);
    fs.writeFileSync(targetPath, filledTemplate);
  }

  private _checkDep(packageName: string, minVersion?: boolean): boolean {
    const depVersion = _.get(
      appPackage,
      ['dependencies', packageName],
      '0.0.0',
    );
    const devDepVersion = _.get(
      appPackage,
      ['devDependencies', packageName],
      '0.0.0',
    );

    if (
      !_.get(appPackage, `dependencies.${packageName}`, false) &&
      !_.get(appPackage, `devDependencies.${packageName}`, false)
    ) {
      red(`✗ ${packageName} isn't in your dependencies`);
      red(`  please install it with yarn/npm`);
      return false;
    } else if (
      !this._fulfillsMinVersion(depVersion) &&
      !this._fulfillsMinVersion(devDepVersion)
    ) {
      red(
        `✗ Your installed version of \`${packageName}\` is not supported, >=${MIN_NEXTJS_VERSION} needed.`,
      );
      return false;
    } else {
      if (minVersion) {
        green(`✓ ${packageName} >= ${MIN_NEXTJS_VERSION} is installed`);
      } else {
        green(`✓ ${packageName} is installed`);
      }
      return true;
    }
  }

  private _fulfillsMinVersion(version: string): boolean {
    // The latest version, which at the moment is greater than the minimum
    // version, shouldn't be a blocker in the wizard.
    if (version === 'latest') {
      return true;
    }

    const cleanedVersion = clean(version);
    if (cleanedVersion) {
      // gte(x, y) : true if x >= y
      return gte(cleanedVersion, MIN_NEXTJS_VERSION);
    }

    const minVersionRange = `>=${MIN_NEXTJS_VERSION}`;
    const userVersionRange = validRange(version);
    const minUserVersion = minVersion(userVersionRange);
    if (minUserVersion == null) {
      // This should never happen
      return false;
    }
    return satisfies(minUserVersion, minVersionRange);
  }
}
