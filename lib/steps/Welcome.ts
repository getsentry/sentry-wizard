import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { l, green, dim, nl } from '../Helper';

export class Welcome extends BaseStep {
  private static didShow = false;
  async emit(answers: Answers) {
    if (Welcome.didShow) return {};
    green('Sentry Setup Wizard will help to configure your project');
    dim('Thank you for using Sentry :)');
    Welcome.didShow = true;
    return {};
  }
}
