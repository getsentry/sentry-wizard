import { Answers } from 'inquirer';
import { type Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runReactNativeWizard } from '../../../src/react-native/react-native-wizard';

export class ReactNative extends BaseIntegration {
  argv: Args;
  public constructor(protected _argv: Args) {
    super(_argv);
    this.argv = _argv;
  }

  public async emit(_answers: Answers): Promise<Answers> {
    await runReactNativeWizard({
      promoCode: this._argv.promoCode,
      url: this._argv.url,
      telemetryEnabled: !this._argv.disableTelemetry,
      uninstall: this._argv.uninstall,
      // eslint-disable-next-line no-console
    }).catch(console.error);

    return {};
  }

  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    return this._shouldConfigure;
  }
}
