import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { ProjectType } from '../Constants';
import { BaseStep } from './BaseStep';
import { Cordova } from './Projects/Cordova';
import { GenericJavascript } from './Projects/GenericJavascript';
import { GenericNode } from './Projects/GenericNode';
import { ReactNative } from './Projects/ReactNative';

export class ConfigureProject extends BaseStep {
  public emit(answers: Answers) {
    const projectType: ProjectType = _.get(
      answers,
      'projectType',
      ProjectType.javascript
    );
    switch (projectType) {
      case ProjectType.reactNative:
        return new ReactNative(this.argv).emit(answers);
      case ProjectType.cordova:
        return new Cordova(this.argv).emit(answers);
      case ProjectType.node:
        return new GenericNode(this.argv).emit(answers);
      default:
        return new GenericJavascript(this.argv).emit(answers);
    }
  }
}
