import { Answers } from 'inquirer';
import { green } from '../Helper';
import { BaseStep } from './Step';

export class Result extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(JSON.stringify(answers, null, '\t'));
    green('🎉  Successfully setup Sentry for your project  🎉');
    return {};
  }
}
