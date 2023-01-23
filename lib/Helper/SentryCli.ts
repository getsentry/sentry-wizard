import { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import { Args } from '../Constants';

export interface SentryCliProps {
  [s: string]: string;
}

type SentryCliConfig = Record<string, SentryCliProps>;

export class SentryCli {
  // eslint-disable-next-line @typescript-eslint/typedef
  private static _resolve = require.resolve;

  constructor(protected _argv: Args) {}

  public setResolveFunction(resolve: (path: string) => string): void {
    SentryCli._resolve = resolve as any;
  }

  public static resolveModuleDir(): string | null {
    try {
      const cliMainPath = SentryCli._resolve(
        '@sentry/cli',
        { paths: [process.cwd()] }
      );
      return path.resolve(path.join(path.dirname(cliMainPath), '..'));
    } catch (Ooo) {
      return null;
    }
  }

  public static resolveModulePackage(): { name?: string, version?: string } | null {
    const cliDir = SentryCli.resolveModuleDir();

    if (cliDir == null) {
      return null;
    }

    try {
      return require(path.join(cliDir, 'package.json'));
    } catch (Ooo) {
      return null;
    }
  }

  public static resolveBinPath(): string | null {
    const cliDir = SentryCli.resolveModuleDir();
    return cliDir !== null
      ? path.join(cliDir, 'bin', 'sentry-cli')
      : null;
  }

  public convertAnswersToProperties(answers: Answers): SentryCliProps {
    const props: SentryCliProps = {};
    props['defaults/url'] = this._argv.url;
    props['defaults/org'] = _.get(answers, 'config.organization.slug', null);
    props['defaults/project'] = _.get(answers, 'config.project.slug', null);
    props['auth/token'] = _.get(answers, 'config.auth.token', null);

    const cliPath = SentryCli.resolveBinPath();
    if (cliPath) {
      props['cli/executable'] = path
        .relative(process.cwd(), cliPath)
        .replace(/\\/g, '\\\\');
    }

    return props;
  }

  /** Create the contents of a `sentry.properties` file */
  public dumpProperties(props: SentryCliProps): string {
    const rv = [];
    for (let key in props) {
      // eslint-disable-next-line no-prototype-builtins
      if (props.hasOwnProperty(key)) {
        const value = props[key];
        key = key.replace(/\//g, '.');
        if (value === undefined || value === null) {
          // comment that property out since it has no value
          rv.push(`#${key}=`);
        } else {
          rv.push(`${key}=${value}`);
        }
      }
    }
    // eslint-disable-next-line prefer-template
    return rv.join('\n') + '\n';
  }

  public dumpConfig(config: SentryCliConfig): string {
    const dumpedSections: string[] = [];
    for (const sectionName in config) {
      // eslint-disable-next-line no-prototype-builtins
      if (config.hasOwnProperty(sectionName)) {
        const props = this.dumpProperties(config[sectionName]);
        const section = `[${sectionName}]\n${props}`;
        dumpedSections.push(section);
      }
    }
    return dumpedSections.join('\n');
  }
}
