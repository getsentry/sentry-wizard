// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import {
  addSentryCliRc,
  askForProjectSelection,
  askForSelfHosted,
  askForWizardLogin,
  confirmContinueEvenThoughNoGitRepo,
  ensurePackageIsInstalled,
  getPackageDotJson,
  installPackage,
  isUsingTypeScript,
  printWelcome,
} from '../utils/clack-utils';
import { hasPackageInstalled } from '../utils/package-json';
import { WizardOptions } from '../utils/types';
import {
  initializeSentryOnEntryClient,
  initializeSentryOnEntryServer,
  updateBuildScript,
  instrumentRootRoute,
  isRemixV2,
  loadRemixConfig,
} from './sdk-setup';
import { debug } from '../utils/debug';

export async function runRemixWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Remix Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueEvenThoughNoGitRepo();

  const remixConfig = await loadRemixConfig();
  const packageJson = await getPackageDotJson();

  // We expect `@remix-run/dev` to be installed for every Remix project
  await ensurePackageIsInstalled(packageJson, '@remix-run/dev', 'Remix');

  const { url: sentryUrl } = await askForSelfHosted(options.url);

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

  const isTS = isUsingTypeScript();
  const isV2 = isRemixV2(remixConfig, packageJson);

  await addSentryCliRc(
    apiKeys.token,
    selectedProject.organization.slug,
    selectedProject.name,
  );

  try {
    await updateBuildScript();
  } catch (e) {
    clack.log
      .warn(`Could not update build script to generate and upload sourcemaps.
Please update your build script manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/sourcemaps/`);
    debug(e);
  }

  try {
    await instrumentRootRoute(isV2, isTS);
  } catch (e) {
    clack.log.warn(`Could not instrument root route.
Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/`);
    debug(e);
  }

  try {
    await initializeSentryOnEntryClient(dsn, isTS);
  } catch (e) {
    clack.log.warn(`Could not initialize Sentry on client entry.
Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/`);
    debug(e);
  }

  try {
    await initializeSentryOnEntryServer(dsn, isTS, isV2);
  } catch (e) {
    clack.log.warn(`Could not initialize Sentry on server entry.
Please do it manually using instructions from https://docs.sentry.io/platforms/javascript/guides/remix/`);
    debug(e);
  }
}
