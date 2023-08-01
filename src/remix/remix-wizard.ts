import {
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
import {
  initializeSentryOnEntryClientTsx,
  initializeSentryOnEntryServerTsx,
  instrumentPackageJson,
  instrumentRootRoute,
  isRemixV2,
  loadRemixConfig,
} from './sdk-setup';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const remixConfig = await loadRemixConfig();
  const packageJson = await getPackageDotJson();
  await ensurePackageIsInstalled(packageJson, '@remix-run/node', 'Remix');

  const { url: sentryUrl } = await askForSelfHosted(options.url);
  // TODO: Test self-hosted Sentry

  const { projects, apiKeys } = await askForWizardLogin({
    promoCode: options.promoCode,
    url: sentryUrl,
    platform: 'javascript-remix',
  });

  const selectedProject = await askForProjectSelection(projects);

  await installPackage({
    packageName: '@sentry/remix',
    alreadyInstalled: hasPackageInstalled('@sentry/remix', packageJson),
  });

  const dsn = selectedProject.keys[0].dsn.public;

  const isV2 = isRemixV2(remixConfig, packageJson);

  await instrumentRootRoute(isV2);
  await instrumentPackageJson();
  await initializeSentryOnEntryClientTsx(dsn);
  await initializeSentryOnEntryServerTsx(dsn, isV2);

  await addSentryCliRc(apiKeys.token);
}
