import type { Answers } from 'inquirer';
import * as path from 'node:path';

import type { Args } from '../Constants';
import { Config } from '../Types';

export interface SentryCliProps {
  'defaults/url': string;
  'defaults/org': string | null;
  'defaults/project': string | null;
  'auth/token': string | null;
  'cli/executable'?: string;
}

type SentryCliConfig = Record<string, Partial<SentryCliProps>>;
type RequireResolve = typeof require.resolve;

export class SentryCli {
  private _resolve: RequireResolve = require.resolve;

  public constructor(protected _argv: Args) {}

  public setResolveFunction(resolve: RequireResolve): void {
    this._resolve = resolve;
  }

  public convertAnswersToProperties(
    answers: Answers & { config?: Config },
  ): SentryCliProps {
    const props: SentryCliProps = {
      'defaults/url': this._argv.url,
      'defaults/org': answers.config?.organization?.slug ?? null,
      'defaults/project': answers.config?.project?.slug ?? null,
      'auth/token': answers.config?.auth?.token ?? null,
    };

    try {
      const cliPath = this._resolve('@sentry/cli/bin/sentry-cli', {
        paths: [process.cwd()],
      });
      props['cli/executable'] = path
        .relative(process.cwd(), cliPath)
        .replace(/\\/g, '\\\\');
    } catch (e) {
      // we do nothing and leave everything as it is
    }
    return props;
  }

  /**
   * Create the contents of a `sentry.properties` file
   * @param props the properties to write to the file
   * @param format the format of the file, either `rc`
   *  (.sentryclirc) or `properties` (sentry.properties)
   */
  public dumpProperties(
    props: Partial<SentryCliProps>,
    format: 'rc' | 'properties' = 'properties',
  ): string {
    const propEntries = Object.entries(props) as [
      keyof SentryCliProps,
      SentryCliProps[keyof SentryCliProps],
    ][];
    const rv: string[] = [];
    for (const [key, value] of propEntries) {
      const normalizedKey =
        format === 'properties'
          ? key.replace(/\//g, '.')
          : key.split('/').at(1) ?? '';
      if (value === undefined || value === null) {
        // comment that property out since it has no value
        rv.push(`#${normalizedKey}=`);
      } else {
        rv.push(`${normalizedKey}=${value}`);
      }
    }
    // eslint-disable-next-line prefer-template
    return rv.join('\n') + '\n';
  }

  public dumpConfig(config: Partial<SentryCliConfig>): string {
    const dumpedSections: string[] = [];
    for (const [sectionName, values] of Object.entries(config)) {
      const props = values ? this.dumpProperties(values, 'rc') : '';
      const section = `[${sectionName}]\n${props}`;
      dumpedSections.push(section);
    }
    return dumpedSections.join('\n');
  }
}
