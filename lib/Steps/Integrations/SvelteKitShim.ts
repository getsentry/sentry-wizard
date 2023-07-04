import type { Answers } from 'inquirer';
import { runSvelteKitWizard } from '../../../src/sveltekit/sveltekit-wizard';

import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';

/**
 * This class just redirects to the new `sveltekit-wizard.ts` flow
 * for anyone calling the wizard without the '-i sveltekit' flag.
 */
export class SvelteKitShim extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runSvelteKitWizard({
      promoCode: this._argv.promoCode,
      url: this._argv.url,
    });
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
