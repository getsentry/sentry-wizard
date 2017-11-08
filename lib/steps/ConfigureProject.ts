import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { ProjectType } from '../Constants';
import { GenericJavascript } from './configure/GenericJavascript';
import { ReactNative } from './configure/ReactNative';
import { BaseStep } from './Step';

export class ConfigureProject extends BaseStep {
  public emit(answers: Answers) {
    const projectType: ProjectType = _.get(answers, 'projectType', ProjectType.browser);
    switch (projectType) {
      case ProjectType.reactNative:
        return new ReactNative(this.argv).emit(answers);
      default:
        return new GenericJavascript(this.argv).emit(answers);
    }
  }
}
