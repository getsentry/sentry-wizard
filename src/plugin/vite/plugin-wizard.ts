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
} from '../../utils/clack-utils';
import { createOrMergeViteFiles, loadViteConfig } from './vite-setup';

import { setupCLIConfig } from '../sentry-cli-setup';

interface ViteWizardOptions {
  promoCode?: string;
}

export async function runViteWizard(
  options: ViteWizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Vite Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const packageJson = await getPackageDotJson();
  await ensurePackageIsInstalled(packageJson, 'vite', 'Vite');

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
    packageName: '@sentry/vite-plugin',
    alreadyInstalled: hasPackageInstalled('@sentry/vite-plugin', packageJson),
  });

  await setupCLIConfig(apiKeys.token, selectedProject, sentryUrl);

  const dsn = selectedProject.keys[0].dsn.public;

  const viteConfig = await loadViteConfig();

  try {
    await createOrMergeViteFiles(dsn, viteConfig);
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


  clack.outro(`
${chalk.green('Successfully installed the Sentry Vite Plugin!')}

${chalk.cyan(
    'You can validate your setup by starting your dev environment (`npm run build`).',
  )}

Check out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite
  `);
}
