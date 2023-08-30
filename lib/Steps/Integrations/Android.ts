import { Answers } from 'inquirer';
import { BaseIntegration } from './BaseIntegration';
import { Args } from '../../Constants';
import { runAndroidWizard } from '../../../src/android/android-wizard';

export class Android extends BaseIntegration {
  public constructor(protected _argv: Args) {
    super(_argv);
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runAndroidWizard({
      promoCode: this._argv.promoCode,
      url: this._argv.url,
      telemetryEnabled: !this._argv.disableTelemetry,
    });
    return {};
  }

  public shouldConfigure(_answers: Answers): Promise<Answers> {
    return this._shouldConfigure;
  }
}
