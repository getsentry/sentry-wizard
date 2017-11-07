import * as _ from 'lodash';
import { Answers } from 'inquirer';
import { ReactNative } from './configure/ReactNative';
import { GenericJavascript } from './configure/GenericJavascript';
import { ProjectType } from './DetectProjectType';
import { BaseStep } from './Step';

export class ConfigureProject extends BaseStep {
  emit(answers: Answers) {
    let projectType: ProjectType = _.get(answers, 'projectType', ProjectType.browser);
    switch (projectType) {
      case ProjectType.reactNative:
        return new ReactNative(this.argv).emit(answers);
      default:
        return new GenericJavascript(this.argv).emit(answers);
    }
  }
}
