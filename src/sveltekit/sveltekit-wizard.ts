// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  abort,
  addSentryCliRc,
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  ensurePackageIsInstalled,
  getPackageDotJson,
  installPackage,
  printWelcome,
} from '../utils/clack-utils';
import { hasPackageInstalled } from '../utils/package-json';
import { WizardOptions } from '../utils/types';
import { createExamplePage } from './sdk-example';
import { createOrMergeSvelteKitFiles, loadSvelteConfig } from './sdk-setup';

export async function runSvelteKitWizard(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry SvelteKit Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const packageJson = await getPackageDotJson();
  await ensurePackageIsInstalled(packageJson, '@sveltejs/kit', 'Sveltekit');

  const { url: sentryUrl, selfHosted } = await askForSelfHosted(options.url);

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
    platform: 'javascript-sveltekit',
  });

  const selectedProject = await askForProjectSelection(projects);

  await installPackage({
    packageName: '@sentry/sveltekit',
    alreadyInstalled: hasPackageInstalled('@sentry/sveltekit', packageJson),
  });

  await addSentryCliRc(apiKeys.token);

  const svelteConfig = await loadSvelteConfig();

  try {
    await createOrMergeSvelteKitFiles(
      {
        dsn: selectedProject.keys[0].dsn.public,
        org: selectedProject.organization.slug,
        project: selectedProject.slug,
        selfHosted,
        url: sentryUrl,
      },
      svelteConfig,
    );
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
    await abort('Exiting Wizard');
    return;
  }

  try {
    await createExamplePage(svelteConfig, {
      selfHosted,
      url: sentryUrl,
      orgSlug: selectedProject.organization.slug,
      projectId: selectedProject.id,
    });
  } catch (e: unknown) {
    clack.log.error('Error while creating an example page to test Sentry:');
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    await abort('Exiting Wizard');
    return;
  }

  clack.outro(`
${chalk.green('Successfully installed the Sentry SvelteKit SDK!')}

${chalk.cyan(
  'You can validate your setup by starting your dev environment (`npm run dev`) and visiting "/sentry-example".',
)}

Check out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/guides/sveltekit/
  `);
}
