import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import { IArgs } from '../../Constants';
import { BaseStep } from '../BaseStep';

export abstract class BaseProject extends BaseStep {
  public type: string;

  constructor(protected argv: IArgs) {
    super(argv);
    this.type = this.constructor.name;
  }

  public abstract emit(answers: Answers): Promise<Answers>;

  public async uninstall(answers: Answers) {
    return {};
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    return { platform: true };
  }

  public async shouldEmit(answers: Answers): Promise<boolean> {
    return (
      _.keys(_.pickBy(await this.shouldConfigure(answers), (active: boolean) => active))
        .length > 0
    );
  }
}
