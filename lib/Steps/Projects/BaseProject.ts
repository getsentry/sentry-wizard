import { Answers } from 'inquirer';
import { BaseStep } from '../BaseStep';

export abstract class BaseProject extends BaseStep {
  public abstract emit(answers: Answers): Promise<Answers>;
  public abstract uninstall(): Promise<Answers>;
  public abstract shouldConfigure(): Promise<Answers>;
}
