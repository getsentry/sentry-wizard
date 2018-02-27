import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { green, l, nl, red } from '../../Helper/Logging';
import { BaseIntegration } from './BaseIntegration';

const MIN_ELECTRON_VERSION_STRING = '1.7.0';
// tslint:disable-next-line:radix
const MIN_ELECTRON_VERSION = parseInt(MIN_ELECTRON_VERSION_STRING.replace(/\D+/g, ''));
let appPackage: any = {};

try {
  appPackage = require(path.join(process.cwd(), 'package.json'));
} catch {
  // We don't need to have this
}

export class Electron extends BaseIntegration {
  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, 'config.dsn.secret', null);
    nl();
    if (!dsn) {
      red('Could not fetch DSN for your project');
      return {};
    }
    nl();

    nl();
    return {};
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    nl();

    // tslint:disable-next-line:radix
    const depVersion = parseInt(
      _.get(appPackage, 'dependencies.electron', '0').replace(/\D+/g, '')
    );
    // tslint:disable-next-line:radix
    const devDepVersion = parseInt(
      _.get(appPackage, 'devDependencies.electron', '0').replace(/\D+/g, '')
    );
    if (depVersion < MIN_ELECTRON_VERSION && devDepVersion < MIN_ELECTRON_VERSION) {
      red(
        `❌ Your installed electron version is to old, >${MIN_ELECTRON_VERSION_STRING} needed`
      );
    } else {
      green(`✅ Installed electron >${MIN_ELECTRON_VERSION_STRING}`);
    }

    nl();
    return { platform: false };
  }
}
