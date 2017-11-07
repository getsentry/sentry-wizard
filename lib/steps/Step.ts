import { Answers } from 'inquirer';
import { debug, nl } from '../Helper';

export abstract class BaseStep implements Step {
  protected isDebug: boolean = false;
  constructor(protected argv: any = {}) {
    this.isDebug = argv.debug;
  }
  abstract emit(answers: Answers): Promise<Answers>;
  debug(msg: any) {
    if (this.isDebug) {
      nl();
      debug(msg);
      nl();
    }
  }
}

export interface Step {
  emit(answers?: Answers): Promise<Answers>;
}
