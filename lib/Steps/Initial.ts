import type { Answers } from 'inquirer';

import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { WIZARD_VERSION } from '../../src/version';

export class Initial extends BaseStep {
  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(_answers: Answers): Promise<Answers> {
    dim('Running Sentry Wizard...');
    dim(`version: ${WIZARD_VERSION}`);
    return {};
  }
}
