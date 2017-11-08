import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { green, l, nl } from '../../Helper';
import { BaseStep } from '../Step';

export class GenericJavascript extends BaseStep {
  public async emit(answers: Answers) {
    const dsn = _.get(answers, 'selectedProject.keys.0.dsn.public', null);
    if (!dsn) {
      return {};
    }
    nl();
    l('Put these lines in to your code to run Sentry');
    green(
      `<script src="https://cdn.ravenjs.com/3.19.1/raven.min.js" crossorigin="anonymous"></script>`
    );
    nl();
    green(`Raven.config('${dsn}').install();`);
    nl();
    green('See https://docs.sentry.io/clients/javascript/ for more details');
    return {};
  }
}
