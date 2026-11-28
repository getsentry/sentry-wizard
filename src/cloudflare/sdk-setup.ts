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
 *
 * @returns true if the worker is set up with Sentry, false if the user has to
 * finish the setup manually
 */
export async function createSentryInitFile(
  dsn: string,
  selectedFeatures: {
    performance: boolean;
  },
  reduceDataCollection: boolean,
): Promise<boolean> {
  const entryPointFromConfig = getEntryPointFromWranglerConfig();

  const entryPoint = entryPointFromConfig || defaultEntryPoint;
  const entryPointPath = path.join(process.cwd(), entryPoint);

  const showManualInstructions = () => {
    clack.log.step('Please wrap your handler with Sentry initialization:');

    clack.note(
      chalk.cyan(
        getCloudflareWorkerTemplate(
          dsn,
          selectedFeatures,
          reduceDataCollection,
        ),
      ),
    );
  };

  if (fs.existsSync(entryPointPath)) {
    clack.log.info(`Found existing entry point: ${chalk.cyan(entryPoint)}`);
  } else if (!entryPointFromConfig) {
    clack.log.info(
      'No entry point found in wrangler config, creating a new one.',
    );

    await fs.promises.mkdir(path.dirname(entryPointPath), {
      recursive: true,
    });
    await fs.promises.writeFile(
      entryPointPath,
      getCloudflareWorkerTemplateWithHandler(),
      { encoding: 'utf-8', flag: 'wx' },
    );

    clack.log.success(`Created ${chalk.cyan(entryPoint)}.`);
  } else {
    clack.log.warn(
      `Entry point ${chalk.cyan(
        entryPoint,
      )} from your wrangler config does not exist.`,
    );
    showManualInstructions();
    return false;
  }

  try {
    await wrapWorkerWithSentry(
      entryPointPath,
      dsn,
      selectedFeatures,
      reduceDataCollection,
    );
    clack.log.success(
      `Wrapped ${chalk.cyan(entryPoint)} with Sentry initialization.`,
    );
    return true;
  } catch (error) {
    clack.log.warn('Failed to wrap worker automatically.');
    showManualInstructions();
    return false;
  }
}
