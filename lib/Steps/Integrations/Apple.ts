import { Answers } from 'inquirer';
import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runAppleWizard } from '../../../src/apple/apple-wizard';

export class Apple extends BaseIntegration {
  argv: Args;
  public constructor(protected _argv: Args) {
    super(_argv);
    this.argv = _argv;
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runAppleWizard({
      promoCode: this._argv.promoCode,
      url: this._argv.url,
      telemetryEnabled: !this._argv.disableTelemetry,
      // eslint-disable-next-line no-console
    }).catch(console.error);

    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    return this._shouldConfigure;
  }
}
