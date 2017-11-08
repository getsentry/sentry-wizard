import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { dim } from '../Helper';
import { BaseStep } from './Step';

let wizardPackage: any = {};
let sentryCliPackage: any = {};

try {
  wizardPackage = require(`${process.cwd()}/node_modules/@sentry/wizard/package.json`);
} catch {
  // We don't need to have this
}

try {
  sentryCliPackage = require(`${process.cwd()}/node_modules/sentry-cli-binary/package.json`);
} catch {
  // We don't need to have this
}

export class Initial extends BaseStep {
  public async emit(answers: Answers) {
    dim('Running Sentry Setup Wizard...');
    // TODO: get sentry cli version
    dim(
      `version: ${_.get(wizardPackage, 'version', 'DEV')} | sentry-cli version: ${_.get(
        sentryCliPackage,
        'version',
        'DEV'
      )}`
    );
    return {};
  }
}
