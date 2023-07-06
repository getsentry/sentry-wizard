import { Answers } from 'inquirer';
import type { Args } from '../../Constants';
import { BaseIntegration } from './BaseIntegration';
import { runAppleWizard } from '../../../src/apple/apple-wizard';

export class Apple extends BaseIntegration {
    public constructor(protected _argv: Args) {
        super(_argv);
    }

    public async emit(_answers: Answers): Promise<Answers> {
        await runAppleWizard({ promoCode: this._argv.promoCode, url: this._argv.url, });
        return {};
    }

    public async shouldConfigure(_answers: Answers): Promise<Answers> {
        return this._shouldConfigure;
    }
}