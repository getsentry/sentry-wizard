/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
import { askForItemSelection } from '../utils/clack-utils';
import { plugin, pluginKts, pluginsBlock, pluginsBlockKts } from './templates';
import * as bash from '../utils/bash';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { fetchSdkVersion } from '../utils/release-registry';

/**
 * A Gradle project may contain multiple modules, some of them may be applications, some of them may be libraries.
 * We are only interested in applications. For example:
 *
 * myproject/
 *   app/
 *   lib1/
 *   lib2/
 *   wearApp/
 *
 * In this case^ we are interested in app/ and wearApp/
 *
 * @param buildGradleFiles a list of build.gradle(.kts) paths that contain the com.android.application plugin
 * @returns the selected project for setting up
 */
export async function selectAppFile(
  buildGradleFiles: string[],
): Promise<string> {
  const appFiles = [];
  for (let index = 0; index < buildGradleFiles.length; index++) {
    const file = buildGradleFiles[index];
    const text = fs.readFileSync(file, 'utf8');
    if (/\(?["']com\.android\.application["']\)?(?!.*\S)/.test(text)) {
      appFiles.push(file);
    }
  }

  let appFile;
  if (appFiles.length === 1) {
    Sentry.setTag('multiple-projects', false);
    appFile = appFiles[0];
  } else {
    Sentry.setTag('multiple-projects', true);
    appFile = (
      await askForItemSelection(
        appFiles,
        'Which project do you want to add Sentry to?',
      )
    ).value;
  }
  return appFile;
}

/**
 * Patches a build.gradle(.kts) file that contains `com.android.application` plugin.
 * There are multiple cases we have to handle here:
 *   - An existing `plugins {}` block:
 *     - We just have to add our plugin inside the block
 *   - No existing `plugins {}` block
 *     - We have to add the entire block in the beginning of the file, BUT *after imports*
 *
 * For example (2nd case):
 *
 * ```
 * import net.ltgt.gradle.errorprone.errorprone
 *
 * // our plugins block goes here <--
 * plugins {
 *   id("io.sentry.android.gradle") version "3.12.0"
 * }
 *
 * apply(plugin = "com.android.application")
 *
 * android {
 *   ...
 * }
 * ```
 *
 * In the end we run `./gradlew` to verify the config is build-able and not broken.
 *
 * @param appFile the selected Gradle application project
 * @returns true if successfully added Sentry Gradle config, false otherwise
 */
export async function addGradlePlugin(appFile: string): Promise<boolean> {
  const gradleScript = fs.readFileSync(appFile, 'utf8');

  if (/\(?["']io\.sentry\.android\.gradle["']\)?/.test(gradleScript)) {
    // sentry gradle plugin is already installed
    clack.log.success(
      chalk.greenBright(
        `${chalk.bold(
          'Sentry Gradle plugin',
        )} is already added to the project.`,
      ),
    );
    return true;
  }

  const pluginVersion = await fetchSdkVersion('sentry.java.android.gradle-plugin');
  const pluginsBlockMatch = /plugins\s*{[^{}]*}/.exec(gradleScript);
  let newGradleScript;
  if (!pluginsBlockMatch) {
    // no "plugins {}" block, we can just add our own after imports
    const regex = /import\s+[\w.]+/gm;
    let importsMatch = regex.exec(gradleScript);
    let insertIndex = 0;
    while (importsMatch) {
      insertIndex = importsMatch.index + importsMatch[0].length + 1;
      importsMatch = regex.exec(gradleScript);
    }

    if (appFile.endsWith('.kts')) {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginsBlockKts(pluginVersion) +
        gradleScript.slice(insertIndex);
    } else {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginsBlock(pluginVersion) +
        gradleScript.slice(insertIndex);
    }
  } else {
    const insertIndex =
      pluginsBlockMatch.index + pluginsBlockMatch[0].length - 1;
    if (appFile.endsWith('.kts')) {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginKts(pluginVersion) +
        gradleScript.slice(insertIndex);
    } else {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        plugin(pluginVersion) +
        gradleScript.slice(insertIndex);
    }
  }
  fs.writeFileSync(appFile, newGradleScript, 'utf8');

  const buildSpinner = clack.spinner();

  buildSpinner.start('Running ./gradlew to verify changes...');

  try {
    await bash.execute('./gradlew');
    buildSpinner.stop(
      chalk.greenBright(
        `${chalk.bold('Sentry Gradle plugin')} added to the project.`,
      ),
    );
  } catch (e) {
    buildSpinner.stop();
    Sentry.captureException('Gradle Sync failed');
    return false;
  }

  return true;
}

/**
 * Looks for the applications packageName (namespace) in the specified build.gradle(.kts) file.
 *
 * ```
 * android {
 *   namespace 'my.package.name' <-- this is what we extract
 *
 *   compileSdkVersion = 31
 *   ...
 * }
 * ```
 * @param appFile
 * @returns the packageName(namespace) of the app if available
 */
export function getNamespace(appFile: string): string | undefined {
  const gradleScript = fs.readFileSync(appFile, 'utf8');

  const namespaceMatch = /namespace\s*=?\s*['"]([^'"]+)['"]/i.exec(
    gradleScript,
  );
  if (!namespaceMatch || namespaceMatch.length <= 1) {
    clack.log.warn('Unable to determine application package name.');
    Sentry.captureException('No package name');
    return undefined;
  }

  const namespace = namespaceMatch[1];
  return namespace;
}
