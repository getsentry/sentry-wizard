import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import { Args } from '../Constants';

export interface SentryCliProps {
  [s: string]: string;
}

export class SentryCli {
  // eslint-disable-next-line @typescript-eslint/typedef
  private _resolve = require.resolve;

  constructor(protected _argv: Args) {}

  public setResolveFunction(resolve: (path: string) => string): void {
    this._resolve = resolve as any;
  }

  public convertAnswersToProperties(answers: Answers): SentryCliProps {
    const props: SentryCliProps = {};
    props['defaults/url'] = this._argv.url;
    props['defaults/org'] = _.get(answers, 'config.organization.slug', null);
    props['defaults/project'] = _.get(answers, 'config.project.slug', null);
    props['auth/token'] = _.get(answers, 'config.auth.token', null);
    try {
      const cliPath = this._resolve('@sentry/cli/bin/sentry-cli');
      props['cli/executable'] = path
        .relative(process.cwd(), cliPath)
        .replace(/\\/g, '\\\\');
    } catch (e) {
      // we do nothing and leave everyting as it is
    }
    return props;
  }

  public dumpProperties(props: SentryCliProps): string {
    const rv = [];
    for (let key in props) {
      // eslint-disable-next-line no-prototype-builtins
      if (props.hasOwnProperty(key)) {
        const value = props[key];
        key = key.replace(/\//g, '.');
        if (value === undefined || value === null) {
          rv.push(`#${key}=`);
        } else {
          rv.push(`${key}=${value}`);
        }
      }
    }
    // eslint-disable-next-line prefer-template
    return rv.join('\n') + '\n';
  }
}
