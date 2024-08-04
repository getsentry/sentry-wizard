import * as fs from 'fs';
import type { Answers } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';

import type { Args } from '../Constants';
import { addToGitignore } from './Git';
import { green, l, nl, red } from './Logging';

const SENTRYCLIRC_FILENAME = '.sentryclirc';
const GITIGNORE_FILENAME = '.gitignore';
const PROPERTIES_FILENAME = 'sentry.properties';

export interface SentryCliProps {
  [s: string]: string;
}

type SentryCliConfig = Record<string, SentryCliProps>;

export class SentryCli {
  // eslint-disable-next-line @typescript-eslint/typedef
  private _resolve = require.resolve;

  public constructor(protected _argv: Args) {}

  public setResolveFunction(resolve: (path: string) => string): void {
    this._resolve = resolve as any;
  }

  public convertAnswersToProperties(answers: Answers): SentryCliProps {
    const props: SentryCliProps = {};
    props['defaults/url'] = this._argv.url;
    props['defaults/org'] = _.get(
      answers,
      'config.organization.slug',
      null,
    ) as string;
    props['defaults/project'] = _.get(
      answers,
      'config.project.slug',
      null,
    ) as string;
    props['auth/token'] = _.get(answers, 'config.auth.token', null) as string;
    try {
      const cliPath = this._resolve('@sentry/cli/bin/sentry-cli', {
        paths: [process.cwd()],
      });
      props['cli/executable'] = path
        .relative(process.cwd(), cliPath)
        .replace(/\\/g, '\\\\');
    } catch (e) {
      // we do nothing and leave everyting as it is
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

  /**
   * Creates `.sentryclirc` and `sentry.properties` files with the CLI properties
   * obtained from the user answers (or from logging into Sentry).
   * The `.sentryclirc` only contains the auth token and will be added to the
   * user's `.gitignore` file. The properties file contains the rest of the
   * properties (org, project, etc.).
   *
   * @param sentryCli instance of the Sentry CLI
   * @param cliProps the properties to write to the files
   */
  public async createSentryCliConfig(cliProps: SentryCliProps): Promise<void> {
    const { 'auth/token': authToken, ...cliPropsToWrite } = cliProps;

    /**
     * To not commit the auth token to the VCS, instead of adding it to the
     * properties file (like the rest of props), it's added to the Sentry CLI
     * config, which is added to the gitignore. This way makes the properties
     * file safe to commit without exposing any auth tokens.
     */
    if (authToken) {
      try {
        await fs.promises.appendFile(
          SENTRYCLIRC_FILENAME,
          this.dumpConfig({ auth: { token: authToken } }),
        );
        green(`✓ Successfully added the auth token to ${SENTRYCLIRC_FILENAME}`);
      } catch {
        red(
          `⚠ Could not add the auth token to ${SENTRYCLIRC_FILENAME}, ` +
            `please add it to identify your user account:\n${authToken}`,
        );
        nl();
      }
    } else {
      red(
        `⚠ Did not find an auth token, please add your token to ${SENTRYCLIRC_FILENAME}`,
      );
      l(
        'To generate an auth token, visit https://sentry.io/settings/account/api/auth-tokens/',
      );
      l(
        'To learn how to configure Sentry CLI, visit ' +
          'https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-sentry-cli',
      );
    }

    await addToGitignore(
      SENTRYCLIRC_FILENAME,
      `⚠ Could not add ${SENTRYCLIRC_FILENAME} to ${GITIGNORE_FILENAME}, ` +
        'please add it to not commit your auth key.',
    );

    try {
      await fs.promises.writeFile(
        `./${PROPERTIES_FILENAME}`,
        this.dumpProperties(cliPropsToWrite),
      );
      green('✓ Successfully created sentry.properties');
    } catch {
      red(`⚠ Could not add org and project data to ${PROPERTIES_FILENAME}`);
      l(
        'See docs for a manual setup: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-sentry-cli',
      );
    }
    nl();
  }
}
