import {BaseStep} from './Step';
import {dim} from '../Helper';
const pj = require('../../package.json');

export default class Initial extends BaseStep {
  emit() {
    dim('Starting Sentry setup...');
    dim(`version: ${pj.version}`);
    // TODO: get sentry cli version
    let sentryCliVersion = 'TODO';
    dim(`sentry-cli version: ${sentryCliVersion}`);
    return Promise.resolve({});
  }
}
