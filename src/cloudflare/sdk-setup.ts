// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { getCloudflareWorkerTemplate } from './templates';

/**
 * Prints the Sentry worker template to the console.
 * Currently focused on Cloudflare Workers, but the structure can be
 * extended for other Cloudflare products in the future.
 */
export function createSentryInitFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
  },
): void {
  clack.log.step('Please wrap your handler with Sentry initialization:');

  // eslint-disable-next-line no-console
  console.log(chalk.cyan(getCloudflareWorkerTemplate(dsn, selectedFeatures)));
}
