import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { Integration } from '../Constants';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
import { BaseProject } from './Projects/BaseProject';

export class ConfigureProject extends BaseStep {
  public async emit(answers: Answers) {
    return getCurrentIntegration(answers).emit(answers);
  }
}
