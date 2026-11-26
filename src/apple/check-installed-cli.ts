// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import { traceStep } from '../telemetry';
import * as bash from '../utils/bash';
import { askToInstallSentryCLI } from '../utils/clack';
import { debug } from '../utils/debug';
import { SENTRY_CLI_INSTALL_DOCS_URL } from './templates';

/**
 * Finds the Sentry CLI, and offers to install it when it is missing.
 *
 * @returns the detected CLI, or undefined when none is installed.
 */
export async function checkInstalledCLI(
  declineWarning = `Without the Sentry CLI, you won't be able to upload debug symbols to Sentry. You can install it later by following the instructions at ${SENTRY_CLI_INSTALL_DOCS_URL}`,
  nonInteractive = false,
): Promise<bash.SentryCli | undefined> {
  debug(`Checking if the Sentry CLI is installed`);
  const cli = bash.detectSentryCli();
  Sentry.setTag('has-cli', !!cli);
  if (cli) {
    // If the CLI is installed, we don't need to ask the user to install it and can exit early.
    debug(`${cli.binary} is installed`);
    Sentry.setTag('cli-binary', cli.binary);
    return cli;
  }

  if (nonInteractive) {
    debug(`The Sentry CLI is not installed; skipping install prompt`);
    clack.log.warn(declineWarning);
    Sentry.setTag('CLI-Installed', false);
    return undefined;
  }

  debug(`The Sentry CLI is not installed, asking user to install it`);
  const shouldInstallCLI = await traceStep('Ask for SentryCLI', () =>
    askToInstallSentryCLI(),
  );
  if (!shouldInstallCLI) {
    debug(`User declined to install the Sentry CLI`);
    clack.log.warn(declineWarning);
    Sentry.setTag('CLI-Installed', false);
    return undefined;
  }

  debug(`User agreed to install the Sentry CLI`);
  await bash.installSentryCLI();
  const installedCli = bash.detectSentryCli();
  Sentry.setTag('CLI-Installed', !!installedCli);
  if (!installedCli) {
    clack.log.warn(
      `The Sentry CLI installer finished, but neither sentry nor sentry-cli was found. ${declineWarning}`,
    );
    return undefined;
  }
  debug(`Installed ${installedCli.binary}`);
  Sentry.setTag('cli-binary', installedCli.binary);
  return installedCli;
}
