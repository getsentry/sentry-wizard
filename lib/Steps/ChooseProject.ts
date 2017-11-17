import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { getProjectTypeChoices, ProjectType } from '../Constants';
import { green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { Cordova } from './Projects/Cordova';
import { GenericJavascript } from './Projects/GenericJavascript';
import { GenericNode } from './Projects/GenericNode';
import { ReactNative } from './Projects/ReactNative';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export class ChooseProject extends BaseStep {
  public async emit(answers: Answers) {
    // If we receive project type as an arg we skip asking
    let projectType = null;
    if (this.argv.type) {
      projectType = { projectType: this.argv.type };
    } else {
      projectType = this.tryDetectingProjectType();
      projectType = await prompt([
        {
          choices: getProjectTypeChoices(),
          default: projectType,
          message: 'What kind of project are you running:',
          name: 'projectType',
          type: 'list',
        },
      ]);
    }

    let project = null;
    switch (projectType.projectType) {
      case ProjectType.reactNative:
        project = new ReactNative(this.argv);
        break;
      case ProjectType.cordova:
        project = new Cordova(this.argv);
        break;
      case ProjectType.node:
        project = new GenericNode(this.argv);
        break;
      default:
        project = new GenericJavascript(this.argv);
        break;
    }

    return { project };
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
