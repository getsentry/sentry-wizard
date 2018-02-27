import { Answers } from 'inquirer';
import { Args } from '../Constants';
import { debug, nl } from '../Helper/Logging';

export abstract class BaseStep implements IStep {
  protected isDebug: boolean = false;
  constructor(protected argv: Args) {
    this.isDebug = argv.debug;
  }
  public abstract emit(answers: Answers): Promise<Answers>;
  public debug(msg: any): void {
    if (this.isDebug) {
      nl();
      debug(msg);
      nl();
    }
  }
}

export interface IStep {
  emit(answers?: Answers): Promise<Answers>;
}
