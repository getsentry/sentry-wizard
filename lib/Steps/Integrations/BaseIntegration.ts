import type { Answers } from 'inquirer';
import * as _ from 'lodash';

import type { Args } from '../../Constants';
import { BaseStep } from '../BaseStep';

export abstract class BaseIntegration extends BaseStep {
  public type: string;
  protected _shouldConfigure: Promise<Answers>;

  public constructor(protected _argv: Args) {
    super(_argv);
    // @ts-ignore property construct does not exist on BaseIntegration
    this.type = this.construct;
  }

  public async uninstall(_answers: Answers): Promise<Answers> {
    return {};
  }

  /**
   * This can be used for example for platform:boolean to determine
   * if we should configure iOS/Android.
   * Basically this will be merged into answers so it can be checked by a later step.
   */
  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }
    this._shouldConfigure = Promise.resolve({ platform: true });
    return this._shouldConfigure;
  }

  public async shouldEmit(_answers: Answers): Promise<boolean> {
    return (
      _.keys(
        _.pickBy(
          await this.shouldConfigure(_answers),
          (active: boolean) => active,
        ),
      ).length > 0
    );
  }

  public abstract emit(answers: Answers): Promise<Answers>;
}
