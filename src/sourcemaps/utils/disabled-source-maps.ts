// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';

import { abortIfCancelled } from '../../utils/clack';

/**
 * Asks whether a setting that disables source maps should be removed.
 *
 * If the setting is unset, the Sentry bundler plugins generate hidden source
 * maps and remove them from the build output after uploading them.
 */
export async function askShouldRemoveDisabledSourceMaps(
  setting: string,
  prettyConfigFilename: string,
): Promise<boolean> {
  const shouldRemove = await abortIfCancelled(
    clack.select({
      message: `Source maps are disabled by ${chalk.cyan(
        setting,
      )} in ${prettyConfigFilename}. Should the wizard remove this setting so that Sentry can un-minify your stack traces?`,
      options: [
        {
          label: 'Yes, remove it',
          hint: 'source maps are not exposed, Sentry removes them from the build output after the upload',
          value: true,
        },
        {
          label: 'No, keep source maps disabled',
          value: false,
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('removed-disabled-source-maps', shouldRemove);

  if (!shouldRemove) {
    clack.log.warn(
      `Source maps stay disabled. Stack traces in Sentry will be minified until you remove ${chalk.cyan(
        setting,
      )} from ${prettyConfigFilename}.`,
    );
  }

  return shouldRemove;
}
