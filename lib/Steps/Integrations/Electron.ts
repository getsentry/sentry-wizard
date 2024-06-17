import * as fs from 'fs';
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import type { Args } from '../../Constants';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_ELECTRON_VERSION_STRING = '2.0.0';
const MIN_ELECTRON_VERSION = parseInt(
  MIN_ELECTRON_VERSION_STRING.replace(/\D+/g, ''),
  10,
);

const CODE_EXAMPLE_MAIN = 
`// ESM
import * as Sentry from '@sentry/electron/main';
// CommonJs
const Sentry = require('@sentry/electron/main');

Sentry.init({
  dsn: '___DSN___',
});`;

const CODE_EXAMPLE_RENDERER = 
`// ESM
import * as Sentry from '@sentry/electron/renderer';
// CommonJs
const Sentry = require('@sentry/electron/renderer');

Sentry.init({});`;

let appPackage: any = {};

function printExample(example: string, title = ''): void {
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

export class Electron extends BaseIntegration {
  protected _sentryCli: SentryCli;

  public constructor(protected _argv: Args) {
    super(_argv);
    this._sentryCli = new SentryCli(this._argv);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, ['config', 'dsn', 'public'], null);
    nl();

    const sentryCliProps = this._sentryCli.convertAnswersToProperties(answers);
    fs.writeFileSync(
      './sentry.properties',
      this._sentryCli.dumpProperties(sentryCliProps),
    );
    green('Successfully created sentry.properties');
    nl();

    printExample(
      CODE_EXAMPLE_MAIN.replace('___DSN___', dsn),
      'Add these lines in to your main process code to setup Sentry:',
    );

    printExample(
      CODE_EXAMPLE_RENDERER,
      'Add these lines in to your renderer processes code to setup Sentry:',
    );

    l('For more information, see https://docs.sentry.io/clients/electron/');
    nl();

    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    let success = true;
    nl();

    success =
      this._checkDep('electron', MIN_ELECTRON_VERSION_STRING) && success;
    success = this._checkDep('@sentry/electron') && success;

    let continued: Answers = { continue: true };
    if (!success && !this._argv.quiet) {
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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return this.shouldConfigure;
  }

  private _checkDep(packageName: string, minVersion?: string): boolean {
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
      red('  please install it with yarn/npm');
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
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      minVersion
        ? green(`✓ ${packageName} > ${minVersion} is installed`)
        : green(`✓ ${packageName} is installed`);
      return true;
    }
  }
}
