import type { Answers } from 'inquirer';
import { runSourcemapsWizard } from '../../../src/sourcemaps/sourcemaps-wizard';

import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';

/**
 * This class just redirects to the `sourcemaps-wizard.ts` flow
 * for anyone calling the wizard without the '-i sveltekit' flag.
 */
export class SourceMapsShim extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runSourcemapsWizard({ promoCode: this._argv.promoCode });
    return {};
  }

  // public async shouldConfigure(_answers: Answers): Promise<Answers> {
  //   // eslint-disable-next-line @typescript-eslint/no-misused-promises
  //   if (this._shouldConfigure) {
  //     return this._shouldConfigure;
  //   }
  //   // eslint-disable-next-line @typescript-eslint/unbound-method
  //   return this.shouldConfigure;
  // }
}
