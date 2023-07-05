import { Answers } from 'inquirer';
import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runAppleWizard } from '../../../src/apple/apple-wizard';

export class Apple extends BaseIntegration {
    public async emit(_answers: Answers): Promise<Answers> {
        await runAppleWizard({ promoCode: this._argv.promoCode });
        return {};
    }

    public constructor(protected _argv: Args) {
        super(_argv);
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