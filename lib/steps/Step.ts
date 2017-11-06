import {Answers} from 'inquirer';
import {debug} from '../Helper';

export abstract class BaseStep implements Step {
  constructor(protected isDebug = false) {}
  abstract emit(answers?: Answers): Promise<Answers>;
  debug(msg: any) {
    if (this.isDebug) debug(msg);
  }
}

export interface Step {
  emit(answers?: Answers): Promise<Answers>;
}
