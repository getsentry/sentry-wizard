import * as fs from 'fs';
import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { Args } from '../../Constants';
import { exists } from '../../Helper/File';
import { debug, dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_ELECTRON_VERSION_STRING = '1.7.0';
const MIN_ELECTRON_VERSION = parseInt(
  MIN_ELECTRON_VERSION_STRING.replace(/\D+/g, ''),
  10,
);

const CODE_EXAMPLE = `import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: '___DSN___',
});`;

const UPLOAD_EXAMPLE = `npm install --save-dev @sentry/cli electron-download
node sentry-symbols.js`;

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
  protected sentryCli: SentryCli;

  constructor(protected argv: Args) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, ['config', 'dsn', 'public'], null);
    nl();

    const sentryCliProps = this.sentryCli.convertAnswersToProperties(answers);
    fs.writeFileSync(
      './sentry.properties',
      this.sentryCli.dumpProperties(sentryCliProps),
    );
    green(`Successfully created sentry.properties`);
    nl();

    const webpackConfig = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'NextJs',
      'next.config.js',
    );

    if (fs.existsSync(webpackConfig)) {
      fs.writeFileSync('next.config.js', fs.readFileSync(webpackConfig));
    } else {
      debug(
        `Couldn't find ${webpackConfig}, probably because you run from src`,
      );
    }

    printExample(
      CODE_EXAMPLE.replace('___DSN___', dsn),
      'Put these lines in to your main and renderer processes to setup Sentry:',
    );

    l(
      'For more information, see https://docs.sentry.io/platforms/javascript/guides/nextjs/',
    );
    nl();

    return {};
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    let success = true;
    nl();

    success = this.checkDep('next') && success;

    let continued: Answers = { continue: true };
    if (!success && !this.argv.quiet) {
      continued = await prompt({
        message:
          'There were errors during your project checkup, do you still want to continue?',
        name: 'continue',
        default: false,
        type: 'confirm',
      });
    }

    nl();

    if (!_.get(continued, 'continue', false)) {
      throw new Error('Please install the required dependencies to continue.');
    }

    this._shouldConfigure = Promise.resolve({ nextjs: true });
    return this.shouldConfigure;
  }

  private checkDep(packageName: string, minVersion?: string): boolean {
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

    if (
      !_.get(appPackage, `dependencies.${packageName}`, false) &&
      !_.get(appPackage, `devDependencies.${packageName}`, false)
    ) {
      red(`✗ ${packageName} isn't in your dependencies`);
      red(`  please install it with yarn/npm`);
      return false;
    } else if (
      minVersion &&
      depVersion < MIN_ELECTRON_VERSION &&
      devDepVersion < MIN_ELECTRON_VERSION
    ) {
      red(
        `✗ Your installed version of ${packageName} is to old, >${MIN_ELECTRON_VERSION_STRING} needed`,
      );
      return false;
    } else {
      minVersion
        ? green(`✓ ${packageName} > ${minVersion} is installed`)
        : green(`✓ ${packageName} is installed`);
      return true;
    }
  }
}
