// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { findWranglerConfig } from './find-wrangler-config';
import { createWranglerConfig } from './create-wrangler-config';

/**
 * Ensures a wrangler config exists, creating one if necessary
 */
export function ensureWranglerConfig(): void {
  const existingConfig = findWranglerConfig();

  if (existingConfig) {
    clack.log.info(
      `Found existing Wrangler config: ${chalk.cyan(existingConfig)}`,
    );
    return;
  }

  clack.log.step('No Wrangler configuration file found.');
  createWranglerConfig();
}
