/* eslint-disable max-lines */
import Chalk from 'chalk';
import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import type { Args } from '../../Constants';
import { addToGitignore } from '../../Helper/Git';
import { debug, green, l, nl, red } from '../../Helper/Logging';
import { mergeConfigFile } from '../../Helper/MergeConfig';
import { checkPackageVersion, hasPackageInstalled } from '../../Helper/Package';
import { getPackageManagerChoice } from '../../Helper/PackageManager';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const COMPATIBLE_NEXTJS_VERSIONS = '>=10.0.8 <14.0.0';
const COMPATIBLE_SDK_VERSIONS = '>=7.3.0';
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

  public constructor(protected _argv: Args) {
    super(_argv);
    this._sentryCli = new SentryCli(this._argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, ['config', 'dsn', 'public'], null);
    nl();

    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    await this._sentryCli.createSentryCliConfig(sentryCliProps);

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
    const hasCompatibleNextjsVersion = checkPackageVersion(
      appPackage,
      'next',
      COMPATIBLE_NEXTJS_VERSIONS,
      true,
    );

    const packageManager = getPackageManagerChoice();
    const hasSdkInstalled = hasPackageInstalled(appPackage, '@sentry/nextjs');

    let hasCompatibleSdkVersion = false;
    // if no package but we have nextjs, let's add it if we can
    if (!hasSdkInstalled && packageManager && hasCompatibleNextjsVersion) {
      await packageManager.installPackage('@sentry/nextjs');
      // can assume it's compatible since we just installed it
      hasCompatibleSdkVersion = true;
    } else {
      // otherwise, let's check the version and spit out the appropriate error
      hasCompatibleSdkVersion = checkPackageVersion(
        appPackage,
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

  private async _createNextConfig(
    configDirectory: string,
    dsn: any,
  ): Promise<void> {
    const templates = fs.readdirSync(configDirectory);
    // next.config.template.js used for merging next.config.js , not its own template,
    // so it shouldn't have a setTemplate call
    const filteredTemplates = templates.filter(
      template => template !== 'next.config.template.js',
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
      await addToGitignore(
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
        await addToGitignore(
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
