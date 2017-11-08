import * as _ from 'lodash';
import { Answers } from 'inquirer';
const path = require('path');

export class SentryCliHelper {
  constructor(protected argv: any = {}) {}

  convertSelectedProjectToProperties(answers: Answers) {
    let props: any = {};
    props['defaults/url'] = this.argv.sentryUrl;
    props['defaults/org'] = _.get(answers, 'selectedProject.organization.slug', null);
    props['defaults/project'] = _.get(answers, 'selectedProject.slug', null);
    props['auth/token'] = _.get(answers, 'wizard.apiKeys.0.token', null);
    try {
      const cliPath = require.resolve('sentry-cli-binary/bin/sentry-cli');
      props['cli/executable'] = path.relative(process.cwd(), cliPath);
    } catch (e) {
      // we do nothing and leave everyting as it is
    }
    return props;
  }

  dumpProperties(props: any) {
    let rv = [];
    for (let key in props) {
      let value = props[key];
      key = key.replace(/\//g, '.');
      if (value === undefined || value === null) {
        rv.push('#' + key + '=');
      } else {
        rv.push(key + '=' + value);
      }
    }
    return rv.join('\n') + '\n';
  }
}
