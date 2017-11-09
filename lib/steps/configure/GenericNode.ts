import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { green, l, nl } from '../../Helper';
import { BaseStep } from '../Step';

export class GenericNode extends BaseStep {
  public async emit(answers: Answers) {
    const dsn = _.get(answers, 'selectedProject.keys.0.dsn.secret', null);
    if (!dsn) {
      return {};
    }
    nl();
    l('Put these lines in to your code to run Sentry');
    nl();
    green(`var Raven = require('raven');`);
    green(`Raven.config('${dsn}').install();`);
    nl();
    l('See https://docs.sentry.io/clients/node/ for more details');
    return {};
  }
}
