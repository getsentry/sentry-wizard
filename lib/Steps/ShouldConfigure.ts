import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { dim } from '../Helper/Logging';
import { getCurrentProject } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
import { BaseProject } from './Projects/BaseProject';

export class ShouldConfigure extends BaseStep {
  public async emit(answers: Answers) {
    return getCurrentProject(answers).shouldConfigure(answers);
  }
}
