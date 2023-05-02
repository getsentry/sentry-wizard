// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import {
  abortIfCancelled,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  ensurePackageIsInstalled,
  getPackageDotJson,
  hasPackageInstalled,
  installPackage,
  printWelcome,
  SentryProjectData,
} from '../utils/clack-utils';
import { createExamplePage } from './sdk-example';
import { createOrMergeSvelteKitFiles, loadSvelteConfig } from './sdk-setup';

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

  const { url: sentryUrl, selfHosted } = await askForSelfHosted();

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

  const svelteConfig = await loadSvelteConfig();

  try {
    await createOrMergeSvelteKitFiles(dsn, svelteConfig);
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
    return;
  }

  //TODO: Adjust the link once SvelteKit docs are live
  //TODO: Also adjust the link in example page template!
  clack.outro(`
${chalk.green('Successfully installed the Sentry SvelteKit SDK!')}

${chalk.cyan(
  'You can validate your setup by starting your dev environment (`npm run dev`) and visiting "/sentry-example-page".',
)}

Check out the SDK documentation for further configuration:
https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md
  `);
}
