import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { green } from '../Helper';

export class Result extends BaseStep {
  async emit(answers: Answers) {
    this.debug(JSON.stringify(answers, null, '\t'));
    green('🎉  Successfully setup Sentry for your project  🎉');
    return {};
  }
}
