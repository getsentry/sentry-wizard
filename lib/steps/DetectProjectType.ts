import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { getProjectTypeChoices, ProjectType } from '../Constants';
import { green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export class DetectProjectType extends BaseStep {
  public async emit(answers: Answers) {
    // If we receive project type as an arg we skip asking
    if (this.argv.type) {
      return { projectType: this.argv.type };
    }
    const projectType = this.tryDetectingProjectType();
    return prompt([
      {
        choices: getProjectTypeChoices(),
        default: projectType,
        message: 'What kind of project are you running:',
        name: 'projectType',
        type: 'list',
      },
    ]);
  }

  public tryDetectingProjectType(): ProjectType | undefined {
    if (_.has(projectPackage, 'dependencies.react-native')) {
      return ProjectType.reactNative;
    }
    if (_.has(projectPackage, 'dependencies.cordova')) {
      return ProjectType.cordova;
    }
    return;
  }
}
