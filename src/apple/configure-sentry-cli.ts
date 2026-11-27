// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';

import { debug } from '../utils/debug';
import * as SentryUtils from '../utils/sentrycli-utils';

export function configureSentryCLI({
  projectDir,
  authToken,
  orgSlug,
  projectSlug,
}: {
  projectDir: string;
  authToken: string;
  orgSlug: string;
  projectSlug: string;
}) {
  debug(`Creating sentryclirc file at path: ${chalk.cyan(projectDir)}`);
  SentryUtils.createSentryCLIRC(projectDir, {
    auth_token: authToken,
    org: orgSlug,
    project: projectSlug,
  });
  clack.log.info(
    `Created a ${chalk.cyan(
      '.sentryclirc',
    )} file in your project directory with your auth token, organization, and project for the Sentry CLI.
    
It was also added to your ${chalk.cyan('.gitignore')} file.
In your CI environment, set the ${chalk.cyan(
      'SENTRY_AUTH_TOKEN',
    )}, ${chalk.cyan('SENTRY_ORG')}, and ${chalk.cyan(
      'SENTRY_PROJECT',
    )} environment variables, and ${chalk.cyan(
      'SENTRY_URL',
    )} for self-hosted Sentry.`,
  );
  Sentry.setTag('sentry-cli-configured', true);
  debug(`Sentry CLI configured: ${chalk.cyan(true.toString())}`);
}
