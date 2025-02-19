import type { Answers } from 'inquirer';
import { join, dirname } from 'node:path';

import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

type PackageJSON = { version?: string };
let wizardPackage: PackageJSON = {};
let sentryCliPackage: PackageJSON = {};

try {
  wizardPackage = require(join(
    dirname(require.resolve('@sentry/wizard')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have this
}

try {
  sentryCliPackage = require(join(
    dirname(require.resolve('@sentry/cli')),
    '..',
    'package.json',
  ));
} catch {
  // We don't need to have this
}

export class Initial extends BaseStep {
  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(_answers: Answers): Promise<Answers> {
    dim('Running Sentry Wizard...');
    dim(
      `version: ${wizardPackage.version ?? 'DEV'} | sentry-cli version: ${
        sentryCliPackage.version ?? 'DEV'
      }`,
    );
    return {};
  }
}
