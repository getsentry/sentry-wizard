import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { green } from '../Helper';

export class Result extends BaseStep {
  emit(answers: Answers) {
    this.debug(JSON.stringify(answers, null, '\t'));
    green('🎉 Successfully setup Sentry in your project');
    return Promise.resolve({});
  }
}
