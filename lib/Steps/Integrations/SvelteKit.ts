import type { Answers } from 'inquirer';
import { runSvelteKitWizard } from '../../../src/sveltekit/sveltekit-wizard';

import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';

export class SvelteKit extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runSvelteKitWizard({ promoCode: this._argv.promoCode });
    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }
    return this.shouldConfigure;
  }
}
