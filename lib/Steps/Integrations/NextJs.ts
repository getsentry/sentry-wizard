import type { Answers } from 'inquirer';
import { runNextjsWizard } from '../../../src/nextjs/nextjs-wizard';

import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';

/**
 * This class just redirects to the new `nextjs-wizard.ts` flow
 * for anyone calling the wizard without the '-i nextjs' flag.
 */
export class NextJs extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runNextjsWizard({ promoCode: this._argv.promoCode });
    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return this.shouldConfigure;
  }
}
