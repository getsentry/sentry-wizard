import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { IArgs } from '../Constants';

export class SentryCli {
  private resolve = require.resolve;

  constructor(protected argv: IArgs) {}

  public setResolveFunction(resolve: (path: string) => string) {
    this.resolve = resolve;
  }

  public convertAnswersToProperties(answers: Answers) {
    const props: any = {};
    props['defaults/url'] = this.argv.url;
    props['defaults/org'] = _.get(answers, 'config.organization.slug', null);
    props['defaults/project'] = _.get(answers, 'config.project.slug', null);
    props['auth/token'] = _.get(answers, 'config.auth.token', null);
    try {
      const cliPath = this.resolve('@sentry/cli/bin/sentry-cli');
      props['cli/executable'] = path
        .relative(process.cwd(), cliPath)
        .replace(/\\/g, '\\\\');
    } catch (e) {
      // we do nothing and leave everyting as it is
    }
    return props;
  }

  public dumpProperties(props: any) {
    const rv = [];
    for (let key in props) {
      if (props.hasOwnProperty(key)) {
        const value = props[key];
        key = key.replace(/\//g, '.');
        if (value === undefined || value === null) {
          rv.push('#' + key + '=');
        } else {
          rv.push(key + '=' + value);
        }
      }
    }
    return rv.join('\n') + '\n';
  }
}
