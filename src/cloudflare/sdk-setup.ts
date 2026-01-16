// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import {
  getCloudflareWorkerTemplate,
  getCloudflareWorkerTemplateWithHandler,
} from './templates';
import {
  defaultEntryPoint,
  getEntryPointFromWranglerConfig,
} from './wrangler/get-entry-point-from-wrangler-config';
import { wrapWorkerWithSentry } from './wrap-worker';

/**
 * Creates or updates the main worker file with Sentry initialization.
 * Currently focused on Cloudflare Workers
 */
export async function createSentryInitFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
    logs: boolean;
  },
): Promise<void> {
  const entryPointFromConfig = getEntryPointFromWranglerConfig();

  if (!entryPointFromConfig) {
    clack.log.info(
      'No entry point found in wrangler config, creating a new one.',
    );

    const cloudflareWorkerTemplate = getCloudflareWorkerTemplateWithHandler();

    await fs.promises.mkdir(
      path.join(process.cwd(), path.dirname(defaultEntryPoint)),
      {
        recursive: true,
      },
    );
    await fs.promises.writeFile(
      path.join(process.cwd(), defaultEntryPoint),
      cloudflareWorkerTemplate,
      { encoding: 'utf-8', flag: 'w' },
    );

    clack.log.success(`Created ${chalk.cyan(defaultEntryPoint)}.`);

    return;
  }

  const entryPointPath = path.join(process.cwd(), entryPointFromConfig);

  if (fs.existsSync(entryPointPath)) {
    clack.log.info(
      `Found existing entry point: ${chalk.cyan(entryPointFromConfig)}`,
    );

    try {
      await wrapWorkerWithSentry(entryPointPath, dsn, selectedFeatures);
      clack.log.success(
        `Wrapped ${chalk.cyan(
          entryPointFromConfig,
        )} with Sentry initialization.`,
      );
    } catch (error) {
      clack.log.warn('Failed to wrap worker automatically.');
      clack.log.step('Please wrap your handler with Sentry initialization:');

      clack.note(
        chalk.cyan(getCloudflareWorkerTemplate(dsn, selectedFeatures)),
      );
    }
    return;
  }
}
