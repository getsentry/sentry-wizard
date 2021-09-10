import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { clean, gte, minVersion, satisfies, validRange } from 'semver';

import { Args } from '../../Constants';
import { debug, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli, SentryCliProps } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_NEXTJS_VERSION = '10.0.8'; // Must be a fixed version: `X.Y.Z`
const PROPERTIES_FILENAME = 'sentry.properties';
const SENTRYCLIRC_FILENAME = '.sentryclirc';
const GITIGNORE_FILENAME = '.gitignore';
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
    await this._createSentryCliConfig(sentryCliProps);

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

  private async _createSentryCliConfig(
    cliProps: SentryCliProps,
  ): Promise<void> {
    const { 'auth/token': authToken, ...cliPropsToWrite } = cliProps;

    /**
     * To not commit the auth token to the VCS, instead of adding it to the
     * properties file (like the rest of props), it's added to the Sentry CLI
     * config, which is added to the gitignore. This way makes the properties
     * file safe to commit without exposing any auth tokens.
     */
    if (authToken) {
      try {
        await fs.promises.appendFile(
          SENTRYCLIRC_FILENAME,
          `[auth]\ntoken=${authToken}`,
        );
        green(`✓ Successfully added the auth token to ${SENTRYCLIRC_FILENAME}`);
      } catch {
        red(
          `⚠ Could not add the auth token to ${SENTRYCLIRC_FILENAME}, ` +
            `please add it to identify your user account:\n${authToken}`,
        );
        nl();
      }
    } else {
      red(
        `⚠ Did not find an auth token, please add your token to ${SENTRYCLIRC_FILENAME}`,
      );
      l(
        'To generate an auth token, visit https://sentry.io/settings/account/api/auth-tokens/',
      );
      l(
        'To learn how to configure Sentry CLI, visit ' +
          'https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-sentry-cli',
      );
    }

    await this._addToGitignore(
      SENTRYCLIRC_FILENAME,
      `⚠ Could not add ${SENTRYCLIRC_FILENAME} to ${GITIGNORE_FILENAME}, ` +
        'please add it to not commit your auth key.',
    );

    try {
      await fs.promises.writeFile(
        `./${PROPERTIES_FILENAME}`,
        this._sentryCli.dumpProperties(cliPropsToWrite),
      );
      green(`✓ Successfully created sentry.properties`);
    } catch {
      red(`⚠ Could not add org and project data to ${PROPERTIES_FILENAME}`);
      l(
        'See docs for a manual setup: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-sentry-cli',
      );
    }
    nl();
  }

  private async _addToGitignore(
    filepath: string,
    errorMsg: string,
  ): Promise<void> {
    /**
     * Don't check whether the given file is ignored because:
     * 1. It's tricky to check it without git.
     * 2. Git might not be installed or accessible.
     * 3. It's convenient to use a module to interact with git, but it would
     *    increase the size x2 approximately. Docs say to run the Wizard without
     *    installing it, and duplicating the size would slow the set-up down.
     * 4. The Wizard is meant to be run once.
     * 5. A message is logged informing users it's been added to the gitignore.
     * 6. It will be added to the gitignore as many times as it runs - not a big
     *    deal.
     * 7. It's straightforward to remove it from the gitignore.
     */
    try {
      await fs.promises.appendFile(
        GITIGNORE_FILENAME,
        `\n# Sentry\n${filepath}\n`,
      );
      green(`✓ ${filepath} added to ${GITIGNORE_FILENAME}`);
    } catch {
      red(errorMsg);
    }
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
