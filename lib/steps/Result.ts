import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { green } from '../Helper';

export class Result extends BaseStep {
  emit(answers: Answers) {
    green(JSON.stringify(answers, null, '\t'));
    return Promise.resolve({});
  }
}
