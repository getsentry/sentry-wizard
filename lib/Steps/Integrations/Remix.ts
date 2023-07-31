import type { Answers } from 'inquirer';

import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runRemixWizard } from '../../../src/remix/remix-wizard';

/**
 * This class just redirects to the new `remix-wizard.ts` flow
 * for anyone calling the wizard without the '-i remix' flag.
 */
export class Remix extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runRemixWizard({
      promoCode: this._argv.promoCode,
      url: this._argv.url,
      telemetryEnabled: !this._argv.disableTelemetry,
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
