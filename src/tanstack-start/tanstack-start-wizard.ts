// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import type { WizardOptions } from '../utils/types';
import { withTelemetry } from '../telemetry';
import {
  abort,
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  getPackageDotJson,
  printWelcome,
  installPackage,
} from '../utils/clack';
import { hasPackageInstalled } from '../utils/package-json';
import { abortIfSpotlightNotSupported } from '../utils/abort-if-sportlight-not-supported';

export async function runTanstackStartWizard(
  options: WizardOptions,
): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'tanstackStart',
      wizardOptions: options,
    },
    () => runTanstackStartWizardWithTelemetry(options),
  );
}

async function runTanstackStartWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { promoCode, ignoreGitChanges, forceInstall } = options;

  printWelcome({
    wizardName: 'Sentry TanStack Start Wizard',
    promoCode,
  });

  const packageJson = await getPackageDotJson();

  if (!packageJson) {
    clack.log.error(
      'Could not find a package.json file in the current directory',
    );
    return;
  }

  if (!hasPackageInstalled('@tanstack/react-start', packageJson)) {
    await abort(
      'This wizard requires a TanStack Start project. Please make sure you have @tanstack/react-start installed.',
    );
    return;
  }

  await confirmContinueIfNoOrDirtyGitRepo({
    ignoreGitChanges,
    cwd: undefined,
  });

  const sentryAlreadyInstalled = hasPackageInstalled(
    '@sentry/tanstackstart-react',
    packageJson,
  );

  const projectData = await getOrAskForProjectData(
    options,
    'javascript-tanstack-start',
  );

  if (projectData.spotlight) {
    return abortIfSpotlightNotSupported('TanStack Start');
  }

  await installPackage({
    packageName: '@sentry/tanstackstart-react',
    alreadyInstalled: sentryAlreadyInstalled,
    forceInstall,
  });

  clack.outro(
    `${chalk.green('Successfully installed the Sentry TanStack Start SDK!')}`,
  );
}
