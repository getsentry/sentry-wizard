/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import { manifest } from './templates';
import xml, { Attributes, ElementCompact } from 'xml-js';
import chalk from 'chalk';

/**
 * Looks for the closing </application> tag in the manifest and adds the Sentry config after it.
 * 
 * For example:
 * ```xml
 * <manifest xmlns:android="http://schemas.android.com/apk/res/android"
 *   xmlns:tools="http://schemas.android.com/tools">
 * 
 *   <application>
 *     ...
 *     // this is what we add and more
 *     <meta-data android:name="io.sentry.dsn" android:value="__dsn__" />
 *   </application> <!-- we are looking for this one
 * </manifest>
 * ```
 * 
 * @param manifestFile the path to the main AndroidManifest.xml file
 * @param dsn 
 * @returns true if successfully patched the manifest, false otherwise
 */
export function addManifestSnippet(manifestFile: string, dsn: string): boolean {
  if (!fs.existsSync(manifestFile)) {
    clack.log.warn('AndroidManifest.xml not found.');
    Sentry.captureException('No AndroidManifest file');
    return false;
  }

  const manifestContent = fs.readFileSync(manifestFile, 'utf8');

  if (/android:name="io\.sentry[^"]*"/i.test(manifestContent)) {
    // sentry is already configured
    clack.log.success(chalk.greenBright('Sentry SDK is already configured.'));
    return true;
  }

  const applicationMatch = /<\/application>/i.exec(manifestContent);
  if (!applicationMatch) {
    clack.log.warn('<application> tag not found within the manifest.');
    Sentry.captureException('No <application> tag');
    return false;
  }

  const insertionIndex = applicationMatch.index;
  const newContent =
    manifestContent.slice(0, insertionIndex) +
    manifest(dsn) +
    manifestContent.slice(insertionIndex);
  fs.writeFileSync(manifestFile, newContent, 'utf8');

  clack.log.success(
    chalk.greenBright(
      `Updated ${chalk.bold(
        'AndroidManifest.xml',
      )} with the Sentry SDK configuration.`,
    ),
  );

  return true;
}

/**
 * There might be multiple <activity> in the manifest, as well as multiple <activity-alias> with category LAUNCHER,
 * but only one main activity with action MAIN. We are looking for this one by parsing xml and walking it.
 * 
 * In addition, older Android versions required to specify the packag name in the manifest,
 * while the new ones - in the Gradle config. So we are just sanity checking if the package name
 * is in the manifest and returning it as well.
 * 
 * For example:
 * 
 * ```xml
 * <manifest xmlns:android="http://schemas.android.com/apk/res/android"
 *   xmlns:tools="http://schemas.android.com/tools"
 *   package="com.example.sample">
 * 
 *   <application>
 *     <activity
 *       android:name="ui.MainActivity"
 *       ...other props>
 *        <intent-filter>
 *          <action android:name="android.intent.action.MAIN" /> <!-- we are looking for this one
 *
 *          <category android:name="android.intent.category.LAUNCHER" />
 *        </intent-filter>
 *     </activity>
 *   </application>
 * </manifest>
 * ```
 * 
 * @param manifestFile path to the AndroidManifest.xml file
 * @returns package name (if available in the manifest) + the main activity name
 */
export function getMainActivity(manifestFile: string): {
  packageName?: string;
  activityName?: string;
} {
  if (!fs.existsSync(manifestFile)) {
    clack.log.warn('AndroidManifest.xml not found.');
    Sentry.captureException('No AndroidManifest file');
    return {};
  }

  const manifestContent = fs.readFileSync(manifestFile, 'utf8');
  const converted: ElementCompact = xml.xml2js(manifestContent, {
    compact: true,
  });
  const activities: ElementCompact[] | ElementCompact | undefined =
    converted.manifest?.application?.activity;
  const packageName: string | undefined =
    converted.manifest?._attributes?.['package'];

  if (!activities) {
    clack.log.warn('No activity found in AndroidManifest.');
    Sentry.captureException('No Activity');
    return {};
  }

  let mainActivity;
  if (Array.isArray(activities)) {
    const withIntentFilter = activities.filter((a) => !!a['intent-filter']);
    mainActivity = withIntentFilter.find((a) => isMainActivity(a));
  } else if (isMainActivity(activities)) {
    mainActivity = activities;
  }

  if (!mainActivity) {
    clack.log.warn('No main activity found in AndroidManifest.');
    Sentry.captureException('No Main Activity');
    return {};
  }

  const attrs = mainActivity._attributes;
  const activityName = attrs?.['android:name'] as string | undefined;
  return { packageName: packageName, activityName: activityName };
}

function isMainActivity(activity: ElementCompact): boolean {
  const intentFilters: ElementCompact[] | ElementCompact =
    activity['intent-filter'];
  if (Array.isArray(intentFilters)) {
    return intentFilters.some((i) => {
      const action: ElementCompact[] | ElementCompact | undefined = i.action;
      return hasMainAction(action);
    });
  } else {
    const action: ElementCompact[] | ElementCompact | undefined =
      intentFilters.action;
    return hasMainAction(action);
  }
}

function hasMainAction(
  action: ElementCompact[] | ElementCompact | undefined,
): boolean {
  if (!action) {
    return false;
  }

  function isMain(attrs?: Attributes): boolean {
    return attrs?.['android:name'] === 'android.intent.action.MAIN';
  }

  if (Array.isArray(action)) {
    return action.some((c) => {
      return isMain(c._attributes);
    });
  } else {
    return isMain(action._attributes);
  }
}
