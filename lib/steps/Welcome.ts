import { Answers } from 'inquirer';
import { dim, green, l, nl } from '../Helper';
import { BaseStep } from './Step';

export class Welcome extends BaseStep {
  private static didShow = false;
  public async emit(answers: Answers) {
    if (Welcome.didShow) {
      return {};
    }
    green('Sentry Setup Wizard will help to configure your project');
    dim('Thank you for using Sentry :)');
    Welcome.didShow = true;
    return {};
  }
}
