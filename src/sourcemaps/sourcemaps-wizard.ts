// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  addSentryCliRc,
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  printWelcome,
} from '../utils/clack-utils';

interface SourceMapsWizardOptions {
  promoCode?: string;
}

export async function runSourcemapsWizard(
  options: SourceMapsWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Source Maps Upload Configuration Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const { url: sentryUrl, selfHosted } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
  });

  const selectedProject = await askForProjectSelection(projects);

  // TODO: Add configuration instructions here, yada yada
  // eslint-disable-next-line no-console
  console.log('Great, I got everything I need for now:', {
    sentryUrl,
    selfHosted,
    projectSlug: selectedProject.slug,
    orgSlug: selectedProject.organization.slug,
    authToken: apiKeys.token ? '***' : 'N/A',
  });

  await addSentryCliRc(apiKeys.token);

  clack.outro(
    `${chalk.green('Everything is set up!')}

   ${chalk.cyan(
     'You can validate your setup by building your project and checking your console for source maps upload logs.\n',
     'Once an error occurs, you will be able to find it on Sentry with an unminigied stack trace.\n',
   )}

   ${chalk.dim(
     'If you encounter any issues, let us know here: https://github.com/getsentry/sentry-javascript/issues',
   )}`,
  );
}
