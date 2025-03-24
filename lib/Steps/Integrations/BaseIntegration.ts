import type { Answers } from 'inquirer';

import type { Args } from '../../Constants';
import { BaseStep } from '../BaseStep';

export abstract class BaseIntegration extends BaseStep {
  public type: string;
  protected _shouldConfigure: Promise<Answers>;

  public constructor(protected _argv: Args) {
    super(_argv);
    this.type = this.constructor.name;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async uninstall(_answers: Answers): Promise<Answers> {
    return {};
  }

  /**
   * This can be used for example for platform:boolean to determine
   * if we should configure iOS/Android.
   * Basically this will be merged into answers so it can be checked by a later step.
   */
  public async shouldConfigure(_answers: Answers): Promise<Answers> {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }
    this._shouldConfigure = Promise.resolve({ platform: true });
    return this._shouldConfigure;
  }

  public async shouldEmit(_answers: Answers): Promise<boolean> {
    return Object.values(await this.shouldConfigure(_answers)).some(
      (active: boolean) => active,
    );
  }

  public abstract emit(answers: Answers): Promise<Answers>;
}
