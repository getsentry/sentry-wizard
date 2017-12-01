import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { green, nl } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class Result extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(answers);
    nl();
    if (this.argv.uninstall) {
      green('😢  Successfully removed Sentry from your project 😢');
    } else {
      green('🎉  Successfully set up Sentry for your project 🎉');
    }
    return {};
  }
}
