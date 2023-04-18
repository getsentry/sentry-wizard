import type { Answers } from 'inquirer';

import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class ShouldConfigure extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    return getCurrentIntegration(answers).shouldConfigure(answers);
  }
}
