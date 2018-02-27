import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import { Args } from '../../Constants';
import { BaseStep } from '../BaseStep';

export abstract class BaseIntegration extends BaseStep {
  public type: string;
  public _shouldConfigure: Promise<Answers>;

  constructor(protected argv: Args) {
    super(argv);
    this.type = this.constructor.name;
  }

  public abstract emit(answers: Answers): Promise<Answers>;

  public async uninstall(answers: Answers): Promise<Answers> {
    return {};
  }

  /**
   * This can be used for example for platform:boolean to determine
   * if we should configure iOS/Android.
   * Basically this will be merged into answers so it can be check by a later step.
   */
  public async shouldConfigure(answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }
    this._shouldConfigure = Promise.resolve({ platform: true });
    return this._shouldConfigure;
  }

  public async shouldEmit(answers: Answers): Promise<boolean> {
    return (
      _.keys(_.pickBy(await this.shouldConfigure(answers), (active: boolean) => active))
        .length > 0
    );
  }
}
