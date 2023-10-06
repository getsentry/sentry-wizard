/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as path from 'path';
import * as Sentry from '@sentry/node';
import * as gradle from './gradle';
import * as manifest from './manifest';
import * as codetools from './code-tools';
import {
  CliSetupConfig,
  abort,
  addSentryCliConfig,
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  printWelcome,
  propertiesCliSetupConfig,
} from '../utils/clack-utils';
import { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import chalk from 'chalk';

const proguardMappingCliSetupConfig: CliSetupConfig = {
  ...propertiesCliSetupConfig,
  name: 'proguard mappings',
};

export async function runAndroidWizard(options: WizardOptions): Promise<void> {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'android',
    },
    () => runAndroidWizardWithTelemetry(options),
  );
}

async function runAndroidWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'Sentry Android Wizard',
    promoCode: options.promoCode,
  });

  await confirmContinueIfNoOrDirtyGitRepo();

  const projectDir = process.cwd();
  const buildGradleFiles = findFilesWithExtensions(projectDir, [
    '.gradle',
    'gradle.kts',
  ]);

  if (!buildGradleFiles || buildGradleFiles.length === 0) {
    clack.log.error(
      'No Gradle project found. Please run this command from the root of your project.',
    );
    Sentry.captureException('No Gradle project found');
    await abort();
    return;
  }

  const appFile = await traceStep('Select App File', () =>
    gradle.selectAppFile(buildGradleFiles),
  );

  const { selectedProject, selfHosted, sentryUrl, authToken } =
    await getOrAskForProjectData(options, 'android');

  // ======== STEP 1. Add Sentry Gradle Plugin to build.gradle(.kts) ============
  clack.log.step(
    `Adding ${chalk.bold('Sentry Gradle plugin')} to your app's ${chalk.cyan(
      'build.gradle',
    )} file.`,
  );
  const pluginAdded = await traceStep('Add Gradle Plugin', () =>
    gradle.addGradlePlugin(
      appFile,
      selectedProject.organization.slug,
      selectedProject.slug,
    ),
  );
  if (!pluginAdded) {
    clack.log.warn(
      "Could not add Sentry Gradle plugin to your app's build.gradle file. You'll have to add it manually.\nPlease follow the instructions at https://docs.sentry.io/platforms/android/#install",
    );
  }
  Sentry.setTag('gradle-plugin-added', pluginAdded);

  // ======== STEP 2. Configure Sentry SDK via AndroidManifest ============
  clack.log.step(
    `Configuring Sentry SDK via ${chalk.cyan('AndroidManifest.xml')}`,
  );
  const appDir = path.dirname(appFile);
  const manifestFile = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');

  const manifestUpdated = traceStep('Update Android Manifest', () =>
    manifest.addManifestSnippet(
      manifestFile,
      selectedProject.keys[0].dsn.public,
    ),
  );
  if (!manifestUpdated) {
    clack.log.warn(
      "Could not configure the Sentry SDK. You'll have to do it manually.\nPlease follow the instructions at https://docs.sentry.io/platforms/android/#configure",
    );
  }
  Sentry.setTag('android-manifest-updated', manifestUpdated);

  // ======== STEP 3. Patch Main Activity with a test error snippet ============
  clack.log.step(
    `Patching ${chalk.bold('Main Activity')} with a test error snippet.`,
  );
  const mainActivity = traceStep('Find Main Activity', () =>
    manifest.getMainActivity(manifestFile),
  );
  let packageName = mainActivity.packageName;
  if (!packageName) {
    // if no package name in AndroidManifest, look into gradle script
    packageName = gradle.getNamespace(appFile);
  }
  const activityName = mainActivity.activityName;
  Sentry.setTag('has-activity-name', !!activityName);
  Sentry.setTag('has-package-name', !!packageName);
  if (!activityName || !packageName) {
    clack.log.warn(
      "Could not find Activity with intent action MAIN. You'll have to manually verify the setup.\nPlease follow the instructions at https://docs.sentry.io/platforms/android/#verify",
    );
    Sentry.captureException('Could not find Main Activity');
  } else {
    const packageNameStable = packageName;
    const activityFile = traceStep('Find Main Activity Source File', () =>
      codetools.findActivitySourceFile(appDir, packageNameStable, activityName),
    );

    const activityPatched = traceStep('Patch Main Activity', () =>
      codetools.patchMainActivity(activityFile),
    );
    if (!activityPatched) {
      clack.log.warn(
        "Could not patch main activity. You'll have to manually verify the setup.\nPlease follow the instructions at https://docs.sentry.io/platforms/android/#verify",
      );
    }
    Sentry.setTag('main-activity-patched', activityPatched);
  }

  // ======== STEP 4. Add sentry-cli config file ============
  clack.log.step(
    `Configuring ${chalk.bold('proguard mappings upload')} via the ${chalk.cyan(
      'sentry.properties',
    )} file.`,
  );

  await addSentryCliConfig({ authToken }, proguardMappingCliSetupConfig);

  // ======== OUTRO ========
  const issuesPageLink = selfHosted
    ? `${sentryUrl}organizations/${selectedProject.organization.slug}/issues/?project=${selectedProject.id}`
    : `https://${selectedProject.organization.slug}.sentry.io/issues/?project=${selectedProject.id}`;

  clack.outro(`
${chalk.greenBright('Successfully installed the Sentry Android SDK!')}

${chalk.cyan(
  `You can validate your setup by launching your application and checking Sentry issues page afterwards
${issuesPageLink}`,
)}

Check out the SDK documentation for further configuration:
https://docs.sentry.io/platforms/android/
  `);
}

//find files with the given extension
function findFilesWithExtensions(
  dir: string,
  extensions: string[],
  filesWithExtensions: string[] = [],
): string[] {
  const cwd = process.cwd();
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      const childDir = path.join(dir, file.name);
      findFilesWithExtensions(childDir, extensions, filesWithExtensions);
    } else if (extensions.some((ext) => file.name.endsWith(ext))) {
      filesWithExtensions.push(path.relative(cwd, path.join(dir, file.name)));
    }
  }
  return filesWithExtensions;
}
