import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { green, l, nl } from '../../Helper/Logging';
import { BaseIntegration } from './BaseIntegration';

export class GenericJavascript extends BaseIntegration {
  public async emit(answers: Answers) {
    const dsn = _.get(answers, 'config.dsn.public', null);
    if (!dsn) {
      return {};
    }
    nl();
    l('Put these lines in to your code to run Sentry');
    nl();
    green(
      `<script src="https://cdn.ravenjs.com/3.19.1/raven.min.js" crossorigin="anonymous"></script>`
    );
    green(`Raven.config('${dsn}').install();`);
    nl();
    l('See https://docs.sentry.io/clients/javascript/ for more details');
    nl();
    nl();
    l('Also, you can upload your sourcemaps now with sentry-cli');
    nl();
    green('sentry-cli releases new RELEASE');
    nl();
    l(
      'See https://docs.sentry.io/clients/javascript/sourcemaps/#using-sentry-cli for more details'
    );
    return {};
  }
}
