import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import { Args } from '../../Constants';
import { debug, dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_NEXTJS_VERSION = '10.0.0';
const PROPERTIES_FILENAME = 'sentry.properties';
const CONFIG_FILENAME = 'next.config.js';
const MERGEABLE_CONFIG_FILENAME = `_${CONFIG_FILENAME}`;

const CODE_EXAMPLE = `import * as Sentry from '@sentry/nextjs';`;

let appPackage: any = {};

function printExample(example: string, title: string = ''): void {
  if (title) {
    l(title);
  }

  nl();
  dim(example.replace(/^/gm, '    '));
  nl();
}

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

    const webpackConfig = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'NextJs',
      CONFIG_FILENAME,
    );

    if (fs.existsSync(webpackConfig)) {
      this._createNextConfig(webpackConfig, dsn);
    } else {
      debug(
        `Couldn't find ${webpackConfig}, probably because you run from src`,
      );
      nl();
    }

    printExample(
      CODE_EXAMPLE.replace('___DSN___', dsn),
      'You can import Sentry like this and start using it:',
    );

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

  private _createNextConfig(webpackConfig: string, dsn: any): void {
    let showMergeMsg = false;
    let dstConfigFilepath = path.posix.join(process.cwd(), CONFIG_FILENAME);
    if (fs.existsSync(dstConfigFilepath)) {
      dstConfigFilepath = path.posix.join(
        process.cwd(),
        MERGEABLE_CONFIG_FILENAME,
      );
      showMergeMsg = true;
    }

    const content = fs
      .readFileSync(webpackConfig)
      .toString()
      .replace('___DSN___', dsn);
    fs.writeFileSync(dstConfigFilepath, content);

    if (showMergeMsg) {
      red(
        'You already have a next.config.js file in your project.\n' +
          `There's a new ${MERGEABLE_CONFIG_FILENAME} file with the Sentry config; ` +
          'please merge this file to your existing config file.',
      );
      nl();
    }
  }

  private _checkDep(packageName: string, minVersion?: boolean): boolean {
    const depVersion = parseInt(
      _.get(appPackage, ['dependencies', packageName], '0').replace(/\D+/g, ''),
      10,
    );
    const devDepVersion = parseInt(
      _.get(appPackage, ['devDependencies', packageName], '0').replace(
        /\D+/g,
        '',
      ),
      10,
    );

    const parsedVersion = parseInt(MIN_NEXTJS_VERSION.replace(/\D+/g, ''));

    if (
      !_.get(appPackage, `dependencies.${packageName}`, false) &&
      !_.get(appPackage, `devDependencies.${packageName}`, false)
    ) {
      red(`✗ ${packageName} isn't in your dependencies`);
      red(`  please install it with yarn/npm`);
      return false;
    } else if (appPackage['dependencies'][packageName] === 'latest') {
      red(
        "✗ `latest` version for NextJS isn't supported, replace it with the actual version number.",
      );
      nl();
      return false;
    } else if (
      minVersion &&
      depVersion < parsedVersion &&
      devDepVersion < parsedVersion
    ) {
      red(
        `✗ Your installed version of ${packageName} is not supported, >${MIN_NEXTJS_VERSION} needed`,
      );
      return false;
    } else {
      if (minVersion) {
        green(`✓ ${packageName} > ${MIN_NEXTJS_VERSION} is installed`);
      } else {
        green(`✓ ${packageName} is installed`);
      }
      return true;
    }
  }
}
