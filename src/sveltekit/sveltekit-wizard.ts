// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  abortIfCancelled,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  ensurePackageIsInstalled,
  installPackage,
  printWelcome,
  SentryProjectData,
} from '../utils/clack-utils';
import { getPackageDotJson, hasPackageInstalled } from '../utils/package-utils';
import { createOrMergeSvelteKitFiles } from './sdk-setup';

import { setupCLIConfig } from './sentry-cli-setup';

interface SvelteKitWizardOptions {
  promoCode?: string;
}

export async function runSvelteKitWizard(
  options: SvelteKitWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry SvelteKit Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const packageJson = await getPackageDotJson();
  await ensurePackageIsInstalled(packageJson, '@sveltejs/kit', 'Sveltekit');

  const { url: sentryUrl } = await askForSelfHosted();

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
  });

  const selectedProject: SentryProjectData | symbol = await clack.select({
    message: 'Select your Sentry project.',
    options: projects.map((project) => {
      return {
        value: project,
        label: `${project.organization.slug}/${project.slug}`,
      };
    }),
  });

  abortIfCancelled(selectedProject);

  await installPackage({
    packageName: '@sentry/sveltekit',
    alreadyInstalled: hasPackageInstalled('@sentry/sveltekit', packageJson),
  });

  await setupCLIConfig(apiKeys.token, selectedProject, sentryUrl);

  const dsn = selectedProject.keys[0].dsn.public;

  try {
    await createOrMergeSvelteKitFiles(dsn);
  } catch (e: unknown) {
    clack.log.error('Error while setting up the SvelteKit SDK:');
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    return;
  }

  //TODO: Adjust the link once SvelteKit docs are live
  clack.outro(`
${chalk.green('Successfully installed the Sentry SvelteKit SDK!')}
Check out the SDK documentation for further configuration:
https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md
  `);
}
