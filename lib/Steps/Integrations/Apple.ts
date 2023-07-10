import { Answers } from 'inquirer';
import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runAppleWizard } from '../../../src/apple/apple-wizard';
import { withTelemetry } from '../../../src/telemetry';

export class Apple extends BaseIntegration {
    argv: Args;
    public constructor(protected _argv: Args) {
        super(_argv);
        this.argv = _argv;
    }

    public async emit(_answers: Answers): Promise<Answers> {
        await withTelemetry(
            {
                enabled: !this.argv.disableTelemetry,
                integration: 'ios'
            },
            async () =>
                await runAppleWizard({ promoCode: this._argv.promoCode, url: this._argv.url, })
            ,
            // eslint-disable-next-line no-console
        ).catch(console.error);

        return {};
    }

    public async shouldConfigure(_answers: Answers): Promise<Answers> {
        return this._shouldConfigure;
    }
}