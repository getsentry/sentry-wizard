import {BaseStep} from './Step';
import {l, green, dim, nl} from '../Helper';

export default class Welcome extends BaseStep {
  private static didShow = false;
  emit() {
    if (Welcome.didShow) return Promise.resolve({});
    nl();
    green('You are about to configure Sentry for your project');
    dim('We will ask you a bunch of questions to configure Sentry for you.');
    nl();
    l('You will need the DSN and an API key for the application to proceed.');
    l('The keys can be found the project settings and at sentry.io/api/');
    nl();
    Welcome.didShow = true;
    return Promise.resolve({});
  }
}
