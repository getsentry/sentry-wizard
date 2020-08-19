import { Answers } from 'inquirer';

import { Args } from '../Constants';
import { debug, nl } from '../Helper/Logging';

export abstract class BaseStep implements IStep {
  protected _isDebug: boolean = false;
  constructor(protected _argv: Args) {
    this._isDebug = _argv.debug;
  }

  public debug(msg: any): void {
    if (this._isDebug) {
      nl();
      debug(msg);
      nl();
    }
  }

  public abstract emit(answers: Answers): Promise<Answers>;
}

export interface IStep {
  emit(answers?: Answers): Promise<Answers>;
}
