import type { Answers } from 'inquirer';

import { green, nl } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class Result extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    this.debug(answers);
    nl();
    if (this._argv.uninstall) {
      green('😢  Successfully removed Sentry from your project 😢');
    } else {
      green('🎉  Successfully set up Sentry for your project 🎉');
    }
    // We need to exit here to stop everything
    setTimeout(() => {
      process.exit();
    }, 100);
    return {};
  }
}
