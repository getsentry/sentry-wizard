import type { Answers } from 'inquirer';

import { dim, green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import chalk from 'chalk';

export class Welcome extends BaseStep {
  private static _didShow = false;

  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(_answers: Answers): Promise<Answers> {
    if (Welcome._didShow) {
      return {};
    }
    if (this._argv.uninstall === false) {
      green('Sentry Wizard will help you to configure your project');
      dim(
        `This wizard sends telemetry data and crash reports to Sentry. This helps us improve the Wizard. You can turn telemetry off at any time by running sentry-wizard ${chalk.cyan(
          '--disable-telemetry',
        )}.`,
      );
      dim('Thank you for using Sentry :)');
    }
    Welcome._didShow = true;
    return {};
  }
}
