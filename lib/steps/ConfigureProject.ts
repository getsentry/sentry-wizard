import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { ProjectType } from '../Constants';
import { getCurrentProject } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
import { BaseProject } from './Projects/BaseProject';

export class ConfigureProject extends BaseStep {
  public async emit(answers: Answers) {
    return getCurrentProject(answers).emit(answers);
  }
}
