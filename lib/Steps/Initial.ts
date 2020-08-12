import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

let wizardPackage: any = {};
let sentryCliPackage: any = {};

try {
  wizardPackage = require(path.join(
    path.dirname(require.resolve('@sentry/wizard')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have this
}

try {
  sentryCliPackage = require(path.join(
    path.dirname(require.resolve('@sentry/cli')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have tahis
}

export class Initial extends BaseStep {
  public async emit(_answers: Answers): Promise<Answers> {
    dim('Running Sentry Wizard...');
    dim(
      `version: ${_.get(
        wizardPackage,
        'version',
        'DEV',
      )} | sentry-cli version: ${_.get(sentryCliPackage, 'version', 'DEV')}`,
    );
    return {};
  }
}
