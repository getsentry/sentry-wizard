import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { green, nl } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class Result extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(answers);
    nl();
    if (this.argv.uninstall) {
      green('😢  Successfully removed Sentry for your project 😢');
    } else if (!_.has(answers, 'wizard')) {
      green('👌  Everything is already up and running 👌');
    } else {
      green('🎉  Successfully setup Sentry for your project 🎉');
    }
    return {};
  }
}
