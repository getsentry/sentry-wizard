/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
import { askForItemSelection } from '../utils/clack-utils';
import { plugin, pluginKts, pluginsBlock, pluginsBlockKts } from './templates';
import * as bash from '../utils/bash';
import * as Sentry from '@sentry/node';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

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

export async function addGradlePlugin(appFile: string): Promise<boolean> {
  const gradleScript = fs.readFileSync(appFile, 'utf8');

  if (/\(?["']io\.sentry\.android\.gradle["']\)?/.test(gradleScript)) {
    // sentry gradle plugin is already installed
    clack.log.success('Sentry Gradle plugin is already added to the project.')
    return true;
  }

  const pluginsBlockMatch = /plugins\s*{[^{}]*}/.exec(gradleScript);
  if (!pluginsBlockMatch) {
    // no "plugins {}" block, we can just add our own after imports
    const regex = /import\s+[\w.]+/gm;
    let importsMatch = regex.exec(gradleScript);
    let insertIndex = 0;
    while (importsMatch) {
      insertIndex = importsMatch.index + importsMatch[0].length + 1;
      importsMatch = regex.exec(gradleScript);
    }

    let newGradleScript;
    if (appFile.endsWith('.kts')) {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginsBlockKts +
        gradleScript.slice(insertIndex);
    } else {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginsBlock +
        gradleScript.slice(insertIndex);
    }
    fs.writeFileSync(appFile, newGradleScript, 'utf8');
  } else {
    const insertIndex =
      pluginsBlockMatch.index + pluginsBlockMatch[0].length - 1;
    let newGradleScript;
    if (appFile.endsWith('.kts')) {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        pluginKts +
        gradleScript.slice(insertIndex);
    } else {
      newGradleScript =
        gradleScript.slice(0, insertIndex) +
        plugin +
        gradleScript.slice(insertIndex);
    }
    fs.writeFileSync(appFile, newGradleScript, 'utf8');
  }

  const buildSpinner = clack.spinner();

  buildSpinner.start("Running ./gradlew to verify changes...");

  try {
    await bash.execute('./gradlew');
    buildSpinner.stop('Sentry Gradle plugin added to the project.');
  } catch (e) {
    buildSpinner.stop();
    Sentry.captureException('Gradle Sync failed');
    return false;
  }

  return true;
}
