import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class ShouldConfigure extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(answers);
    return {};
  }
}
