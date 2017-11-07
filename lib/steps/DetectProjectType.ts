import { prompt, Question, Answers } from 'inquirer';
import { BaseStep } from './Step';
import { green } from '../Helper';
import * as _ from 'lodash';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export enum ProjectType {
  reactNative = 'react-native',
  browser = 'browser',
  node = 'node'
}

export class DetectProjectType extends BaseStep {
  emit(answers: Answers) {
    let projectType = this.tryDetectingProjectType();
    return prompt([
      {
        type: 'list',
        name: 'projectType',
        default: projectType,
        message: 'What kind of project are you running:',
        choices: [
          {
            name: `Generic Node.js`,
            value: ProjectType.node
          },
          {
            name: `Generic web frontend`,
            value: ProjectType.browser
          },
          {
            name: `React Native`,
            value: ProjectType.reactNative
          }
        ]
      }
    ]);
  }

  tryDetectingProjectType(): ProjectType | undefined {
    if (_.has(projectPackage, 'dependencies.react-native')) {
      return ProjectType.reactNative;
    }
    return;
  }
}
