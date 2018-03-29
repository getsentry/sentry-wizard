import * as fs from 'fs';
import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { Args } from '../../Constants';
import { exists } from '../../Helper/File';
import { debug, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_ELECTRON_VERSION_STRING = '1.7.0';
// tslint:disable-next-line:radix
const MIN_ELECTRON_VERSION = parseInt(
  MIN_ELECTRON_VERSION_STRING.replace(/\D+/g, ''),
);
let appPackage: any = {};

try {
  appPackage = require(path.join(process.cwd(), 'package.json'));
} catch {
  // We don't need to have this
}

export class Electron extends BaseIntegration {
  protected sentryCli: SentryCli;

  constructor(protected argv: Args) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, 'config.dsn.secret', null);
    nl();

    const sentryCliProps = this.sentryCli.convertAnswersToProperties(answers);
    fs.writeFileSync(
      './sentry.properties',
      this.sentryCli.dumpProperties(sentryCliProps),
    );
    green(`Successfully created sentry.properties`);

    const symbolsScript = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'Electron',
      'symbols.js',
    );
    if (fs.existsSync(symbolsScript)) {
      fs.writeFileSync('sentry-symbols.js', fs.readFileSync(symbolsScript));
    } else {
      debug(
        `Couldn't find ${symbolsScript}, probably because you run from src`,
      );
    }

    nl();
    l(
      'Put these lines in to your main and renderer processes to corretly run Sentry.',
    );
    l('It will catch all possible crashes javascript/node/native:');
    nl();
    green(`const { SentryClient } = require('@sentry/electron');`);
    nl();
    green(`SentryClient.create({`);
    green(`  dsn: '${dsn}'`);
    green(`});`);

    nl();
    l(
      'Also please run following command to upload symbols to Sentry for native crash handling:',
    );
    green(`node sentry-symbols.js`);
    nl();
    l(
      'See https://docs.sentry.io/clients/javascript/integrations/electron/ for more details',
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

    success = this.checkDep('electron', MIN_ELECTRON_VERSION_STRING) && success;
    success = this.checkDep('electron-download') && success;
    success = this.checkDep('@sentry/core') && success;
    success = this.checkDep('@sentry/electron') && success;

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

    this._shouldConfigure = Promise.resolve({ electron: true });
    return this.shouldConfigure;
  }

  private checkDep(packageName: string, minVersion?: string): boolean {
    // tslint:disable-next-line:radix
    const depVersion = parseInt(
      _.get(appPackage, `dependencies.${packageName}`, '0').replace(/\D+/g, ''),
    );
    // tslint:disable-next-line:radix
    const devDepVersion = parseInt(
      _.get(appPackage, `devDependencies.${packageName}`, '0').replace(
        /\D+/g,
        '',
      ),
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
        `✗ Your installed version of ${packageName}is to old, >${MIN_ELECTRON_VERSION_STRING} needed`,
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
