/* eslint-disable max-lines */
import Chalk from 'chalk';
import { exec } from 'child_process';
import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { satisfies, subset, valid, validRange } from 'semver';
import { promisify } from 'util';

import { Args } from '../../Constants';
import { debug, green, l, nl, red } from '../../Helper/Logging';
import { mergeConfigFile } from '../../Helper/MergeConfig';
import { SentryCli, SentryCliProps } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

type PackageManager = 'yarn' | 'npm' | 'pnpm';

const COMPATIBLE_NEXTJS_VERSIONS = '>=10.0.8 <14.0.0';
const COMPATIBLE_SDK_VERSIONS = '>=7.3.0';
const PROPERTIES_FILENAME = 'sentry.properties';
const SENTRYCLIRC_FILENAME = '.sentryclirc';
const GITIGNORE_FILENAME = '.gitignore';
const CONFIG_DIR = 'configs/';
const MERGEABLE_CONFIG_INFIX = 'wizardcopy';

// for those files which can go in more than one place, the list of places they
// could go (the first one which works will be used)
const TEMPLATE_DESTINATIONS: { [key: string]: string[] } = {
  '_error.js': ['pages', 'src/pages'],
  'next.config.js': ['.'],
  'sentry.server.config.js': ['.'],
  'sentry.client.config.js': ['.'],
  'sentry.edge.config.js': ['.'],
};

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

    const templateDirectory = path.join(__dirname, '..', '..', '..', 'NextJs');
    const configDirectory = path.join(templateDirectory, CONFIG_DIR);

    if (fs.existsSync(configDirectory)) {
      await this._createNextConfig(configDirectory, dsn);
    } else {
      debug(
        `Couldn't find ${configDirectory}, probably because you ran this from inside of \`/lib\` rather than \`/dist\``,
      );
      nl();
    }

    const selectedProjectSlug: string | null = answers.config?.project?.slug;
    if (selectedProjectSlug) {
      const hasFirstEvent = answers.wizard?.projects?.find?.(
        (p: { slug: string }) => p.slug === selectedProjectSlug,
      )?.firstEvent;
      if (!hasFirstEvent) {
        await this._setTemplate(
          templateDirectory,
          'sentry_sample_error.js',
          ['pages', 'src/pages'],
          dsn,
        );
        l(
          Chalk.bgYellowBright(`
|------------------------------------------------------------------------|
|                          Installation Complete                         |
| To verify your installation and finish onboarding, launch your Next.js |
| application, navigate to http://localhost:3000/sentry_sample_error     |
| and send us a sample error.                                            |
|------------------------------------------------------------------------|
`),
        );
      }
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
    const hasCompatibleNextjsVersion = this._checkPackageVersion(
      'next',
      COMPATIBLE_NEXTJS_VERSIONS,
      true,
    );

    const packageManager = this._getPackageMangerChoice();
    const hasSdkInstalled = this._hasPackageInstalled('@sentry/nextjs');

    let hasCompatibleSdkVersion = false;
    // if no package but we have nextjs, let's add it if we can
    if (!hasSdkInstalled && packageManager && hasCompatibleNextjsVersion) {
      await this._installPackage('@sentry/nextjs', packageManager);
      // can assume it's compatible since we just installed it
      hasCompatibleSdkVersion = true;
    } else {
      // otherwise, let's check the version and spit out the appropriate error
      hasCompatibleSdkVersion = this._checkPackageVersion(
        '@sentry/nextjs',
        COMPATIBLE_SDK_VERSIONS,
        true,
      );
    }
    const hasAllPackagesCompatible =
      hasCompatibleNextjsVersion && hasCompatibleSdkVersion;

    if (!hasAllPackagesCompatible && !this._argv.quiet) {
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
          this._sentryCli.dumpConfig({ auth: { token: authToken } }),
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

  private async _createNextConfig(
    configDirectory: string,
    dsn: any,
  ): Promise<void> {
    const templates = fs.readdirSync(configDirectory);
    // next.config.template.js used for merging next.config.js , not its own template,
    // so it shouldn't have a setTemplate call
    const filteredTemplates = templates.filter(
      (template) => template !== 'next.config.template.js',
    );
    for (const template of filteredTemplates) {
      await this._setTemplate(
        configDirectory,
        template,
        TEMPLATE_DESTINATIONS[template],
        dsn,
      );
    }
    red(
      '⚠ Performance monitoring is enabled capturing 100% of transactions.\n' +
        '  Learn more in https://docs.sentry.io/product/performance/',
    );
    nl();
  }

  private async _setTemplate(
    configDirectory: string,
    templateFile: string,
    destinationOptions: string[],
    dsn: string,
  ): Promise<void> {
    const templatePath = path.join(configDirectory, templateFile);

    for (const destinationDir of destinationOptions) {
      if (!fs.existsSync(destinationDir)) {
        continue;
      }
      const destinationPath = path.join(destinationDir, templateFile);
      // in case the file in question already exists, we'll make a copy with
      // `MERGEABLE_CONFIG_INFIX` inserted just before the extension, so as not
      // to overwrite the existing file
      const mergeableFilePath = path.join(
        destinationDir,
        this._spliceInPlace(
          templateFile.split('.'),
          -1,
          0,
          MERGEABLE_CONFIG_INFIX,
        ).join('.'),
      );

      if (templateFile === 'next.config.js') {
        await this._mergeNextConfig(
          destinationPath,
          templatePath,
          destinationDir,
          templateFile,
          configDirectory,
          mergeableFilePath,
        );
        return;
      } else {
        if (!fs.existsSync(destinationPath)) {
          this._fillAndCopyTemplate(templatePath, destinationPath, dsn);
        } else if (!fs.existsSync(mergeableFilePath)) {
          this._fillAndCopyTemplate(templatePath, mergeableFilePath, dsn);
          red(
            `File \`${templateFile}\` already exists, so created \`${mergeableFilePath}\`.\n` +
              'Please merge those files.',
          );
          nl();
        } else {
          red(
            `Both \`${templateFile}\` and \`${mergeableFilePath}\` already exist.\n` +
              'Please merge those files.',
          );
          nl();
        }
        return;
      }
    }

    red(
      `Could not find appropriate destination for \`${templateFile}\`. Tried: ${destinationOptions}.`,
    );
    nl();
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

  private _hasPackageInstalled(packageName: string): boolean {
    const depsVersion = _.get(appPackage, ['dependencies', packageName]);
    const devDepsVersion = _.get(appPackage, ['devDependencies', packageName]);
    return !!depsVersion || !!devDepsVersion;
  }

  private _getPackageMangerChoice(): PackageManager | null {
    if (fs.existsSync(path.join(process.cwd(), 'yarn.lock'))) {
      return 'yarn';
    }
    if (fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
      return 'npm';
    }
    return null;
  }

  private _getInstallCommand(packageManager: PackageManager): string {
    switch (packageManager) {
      case 'yarn':
        return 'yarn add';
      case 'pnpm':
        return 'pnpm add';
      case 'npm':
        return 'npm install';
      default:
        throw new Error(`Unknown package manager: ${packageManager}`);
    }
  }

  private async _installPackage(
    packageName: string,
    packageManager: PackageManager,
  ): Promise<void> {
    const command = this._getInstallCommand(packageManager);
    await promisify(exec)(`${command} ${packageName}`);
    green(`✓ Added \`${packageName}\` using \`${command}\`.`);
    return;
  }

  private _checkPackageVersion(
    packageName: string,
    acceptableVersions: string,
    canBeLatest: boolean,
  ): boolean {
    const depsVersion = _.get(appPackage, ['dependencies', packageName]);
    const devDepsVersion = _.get(appPackage, ['devDependencies', packageName]);

    if (!depsVersion && !devDepsVersion) {
      red(`✗ ${packageName} isn't in your dependencies.`);
      red('  Please install it with yarn/npm.');
      return false;
    } else if (
      !this._fulfillsVersionRange(
        depsVersion,
        acceptableVersions,
        canBeLatest,
      ) &&
      !this._fulfillsVersionRange(
        devDepsVersion,
        acceptableVersions,
        canBeLatest,
      )
    ) {
      red(
        `✗ Your \`package.json\` specifies a version of \`${packageName}\` outside of the compatible version range ${acceptableVersions}.\n`,
      );
      return false;
    } else {
      green(
        `✓ A compatible version of \`${packageName}\` is specified in \`package.json\`.`,
      );
      return true;
    }
  }

  private _fulfillsVersionRange(
    version: string,
    acceptableVersions: string,
    canBeLatest: boolean,
  ): boolean {
    if (version === 'latest') {
      return canBeLatest;
    }

    let cleanedUserVersion, isRange;

    if (valid(version)) {
      cleanedUserVersion = valid(version);
      isRange = false;
    } else if (validRange(version)) {
      cleanedUserVersion = validRange(version);
      isRange = true;
    }

    return (
      // If the given version is a bogus format, this will still be undefined and we'll automatically reject it
      !!cleanedUserVersion &&
      (isRange
        ? subset(cleanedUserVersion, acceptableVersions)
        : satisfies(cleanedUserVersion, acceptableVersions))
    );
  }

  private _spliceInPlace(
    arr: Array<any>,
    start: number,
    deleteCount: number,
    ...inserts: any[]
  ): Array<any> {
    arr.splice(start, deleteCount, ...inserts);
    return arr;
  }

  private async _mergeNextConfig(
    destinationPath: string,
    templatePath: string,
    destinationDir: string,
    templateFile: string,
    configDirectory: string,
    mergeableFilePath: string,
  ): Promise<void> {
    // if no next.config.js exists, we'll create one
    if (!fs.existsSync(destinationPath)) {
      fs.copyFileSync(templatePath, destinationPath);
      green('Created File `next.config.js`');
      nl();
    } else {
      // creates a file name for the copy of the original next.config.js file
      // with the name `next.config.original.js`
      const originalFileName = this._spliceInPlace(
        templateFile.split('.'),
        -1,
        0,
        'original',
      ).join('.');
      const originalFilePath = path.join(destinationDir, originalFileName);
      // makes copy of original next.config.js
      fs.writeFileSync(originalFilePath, fs.readFileSync(destinationPath));
      await this._addToGitignore(
        originalFilePath,
        'Unable to add next.config.original.js to gitignore',
      );

      const mergedTemplatePath = path.join(
        configDirectory,
        'next.config.template.js',
      );
      // attempts to merge with existing next.config.js, if true -> success
      if (mergeConfigFile(destinationPath, mergedTemplatePath)) {
        green(
          `Updated \`${templateFile}\` with Sentry. The original ${templateFile} was saved as \`next.config.original.js\`.\n` +
            'Information on the changes made to the Next.js configuration file an be found at https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/',
        );
        nl();
      } else {
        // if merge fails, we'll create a copy of the `next.config.js` template and ask them to merge
        fs.copyFileSync(templatePath, mergeableFilePath);
        await this._addToGitignore(
          mergeableFilePath,
          'Unable to add next.config.wizard.js template to gitignore',
        );
        red(
          `Unable to merge  \`${templateFile}\`, so created \`${mergeableFilePath}\`.\n` +
            'Please integrate next.config.wizardcopy.js into your next.config.js or next.config.ts file',
        );
        nl();
      }
    }
  }
}
