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
  // getRootRouteTemplate,
  instrumentRootRoute,
  loadRemixConfig,
} from './sdk-setup';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

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

  const remixConfig = await loadRemixConfig();

  const usesV2ErrorBoundary = remixConfig.future?.v2_errorBoundary;

  await instrumentRootRoute(usesV2ErrorBoundary);
  await instrumentPackageJson();
  await initializeSentryOnEntryClientTsx(dsn);
  await initializeSentryOnEntryServerTsx(dsn);

  await addSentryCliRc(apiKeys.token);
}
