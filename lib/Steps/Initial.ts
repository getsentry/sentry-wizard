import type { Answers } from 'inquirer';
import { join, dirname } from 'node:path';

import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { readFileSync } from 'node:fs';

let sea: { isSea: () => boolean };
try {
  // This is to maintain compatibility with Node 20.11- as
  // the `node:sea` module is added in Node 20.12+
  sea = require('node:sea') as { isSea: () => boolean };
} catch {
  sea = { isSea: () => false };
}

type PackageJSON = { version?: string };
let wizardPackage: PackageJSON = {};
let sentryCliPackage: PackageJSON = {};

try {
  wizardPackage = sea.isSea()
    ? { version: process.env.npm_package_version }
    : (JSON.parse(
        readFileSync(
          join(
            dirname(require.resolve('@sentry/wizard')),
            '..',
            'package.json',
          ),
          'utf-8',
        ),
      ) as PackageJSON);
} catch {
  // We don't need to have this
}

try {
  sentryCliPackage = JSON.parse(
    readFileSync(
      join(dirname(require.resolve('@sentry/cli')), '..', 'package.json'),
      'utf-8',
    ),
  ) as PackageJSON;
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
