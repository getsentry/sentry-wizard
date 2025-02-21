import type { Answers } from 'inquirer';
import { join, dirname } from 'node:path';

import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { readFileSync } from 'node:fs';

type PackageJSON = { version?: string };
let wizardPackage: PackageJSON = {};

try {
  wizardPackage = process.env.npm_package_version
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

export class Initial extends BaseStep {
  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(_answers: Answers): Promise<Answers> {
    dim('Running Sentry Wizard...');
    dim(`version: ${wizardPackage.version ?? 'DEV'}`);
    return {};
  }
}
