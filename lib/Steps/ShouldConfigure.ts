import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { dim } from '../Helper/Logging';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class ShouldConfigure extends BaseStep {
  public async emit(answers: Answers) {
    return getCurrentIntegration(answers).shouldConfigure(answers);
  }
}
