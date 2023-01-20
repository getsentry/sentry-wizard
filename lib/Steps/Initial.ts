import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import { dim } from '../Helper/Logging';
import { SentryCli } from '../Helper/SentryCli';
import { BaseStep } from './BaseStep';

let wizardPackage: any = {};

try {
  wizardPackage = require(path.join(
    path.dirname(require.resolve('@sentry/wizard')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have this
}

export class Initial extends BaseStep {
  public async emit(_answers: Answers): Promise<Answers> {
    dim('Running Sentry Wizard...');
    dim(
      `version: ${_.get(
        wizardPackage,
        'version',
        'DEV',
      )} | sentry-cli version: ${_.get(SentryCli.resolveModulePackage(), 'version', 'DEV')}`,
    );
    return {};
  }
}
