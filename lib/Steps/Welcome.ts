import { Answers } from 'inquirer';
import { dim, green, l, nl } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class Welcome extends BaseStep {
  private static didShow = false;
  public async emit(answers: Answers): Promise<Answers> {
    if (Welcome.didShow) {
      return {};
    }
    if (this.argv.uninstall === false) {
      green('Sentry Wizard will help you to configure your project');
      dim('Thank you for using Sentry :)');
    }
    Welcome.didShow = true;
    return {};
  }
}
