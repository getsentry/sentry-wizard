// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';

import { debug } from '../utils/debug';
import * as SentryUtils from '../utils/sentrycli-utils';

export function configureSentryCLI({
  projectDir,
  authToken,
}: {
  projectDir: string;
  authToken: string;
}) {
  debug(`Creating sentryclirc file at path: ${chalk.cyan(projectDir)}`);
  SentryUtils.createSentryCLIRC(projectDir, { auth_token: authToken });
  clack.log.info(
    `Created a ${chalk.cyan(
      '.sentryclirc',
    )} file in your project directory to provide an auth token for Sentry CLI.
    
It was also added to your ${chalk.cyan('.gitignore')} file.
Set the ${chalk.cyan(
      'SENTRY_AUTH_TOKEN',
    )} environment variable in your CI environment. See https://docs.sentry.io/cli/configuration/#auth-token for more information.`,
  );
  Sentry.setTag('sentry-cli-configured', true);
  debug(`Sentry CLI configured: ${chalk.cyan(true.toString())}`);
}
