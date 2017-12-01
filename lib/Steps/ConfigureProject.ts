import { Answers } from 'inquirer';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class ConfigureProject extends BaseStep {
  public async emit(answers: Answers) {
    return getCurrentIntegration(answers).emit(answers);
  }
}
