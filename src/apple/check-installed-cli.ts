// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import { traceStep } from '../telemetry';
import * as bash from '../utils/bash';
import { askToInstallSentryCLI } from '../utils/clack';
import { debug } from '../utils/debug';

export async function checkInstalledCLI() {
  debug(`Checking if sentry-cli is installed`);
  const hasCli = bash.hasSentryCLI();
  Sentry.setTag('has-cli', hasCli);
  if (hasCli) {
    // If the CLI is installed, we don't need to ask the user to install it and can exit early.
    debug(`sentry-cli is installed`);
    return;
  }

  debug(`sentry-cli is not installed, asking user to install it`);
  const shouldInstallCLI = await traceStep('Ask for SentryCLI', () =>
    askToInstallSentryCLI(),
  );
  if (shouldInstallCLI) {
    debug(`User agreed to install sentry-cli`);
    await bash.installSentryCLI();
    Sentry.setTag('CLI-Installed', true);
  } else {
    debug(`User declined to install sentry-cli`);
    clack.log.warn(
      "Without sentry-cli, you won't be able to upload debug symbols to Sentry. You can install it later by following the instructions at https://docs.sentry.io/cli/",
    );
    Sentry.setTag('CLI-Installed', false);
  }
}
