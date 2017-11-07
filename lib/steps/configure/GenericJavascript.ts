import * as _ from 'lodash';
import { Answers } from 'inquirer';
import { BaseStep } from '../Step';
import { l, nl, green } from '../../Helper';

export class GenericJavascript extends BaseStep {
  emit(answers: Answers) {
    let dsn = _.get(answers, 'selectedProject.keys.0.dsn.public', null);
    if (dsn) {
      nl();
      l('Put these lines in to your code to run Sentry');
      green(
        `<script src="https://cdn.ravenjs.com/3.19.1/raven.min.js" crossorigin="anonymous"></script>`
      );
      nl();
      green(`Raven.config('${dsn}').install();`);
      nl();
      green('See https://docs.sentry.io/clients/javascript/ for more details');
    }
    return Promise.resolve({});
  }
}
