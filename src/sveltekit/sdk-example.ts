import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import { PartialSvelteConfig } from './sdk-setup';
import {
  getSentryExampleApiRoute,
  getSentryExampleSveltePage,
} from './templates';

/**
 * Creates example page and API route to test Sentry
 */
export async function createExamplePage(
  svelteConfig: PartialSvelteConfig,
  projectProps: {
    selfHosted: boolean;
    url: string;
    orgSlug: string;
    projectId: string;
  },
): Promise<void> {
  const routesDirectory = svelteConfig.kit?.files?.routes || 'src/routes';
  const exampleRoutePath = path.resolve(
    path.join(routesDirectory, 'sentry-example'),
  );

  if (!fs.existsSync(routesDirectory)) {
    clack.log.warn(
      `Couldn't find your routes directory. Creating it now: ${routesDirectory}`,
    );
    fs.mkdirSync(routesDirectory, { recursive: true });
  }

  if (!fs.existsSync(exampleRoutePath)) {
    fs.mkdirSync(exampleRoutePath);
  } else {
    clack.log.warn(
      `It seems like a sentry example page already exists (${path.basename(
        exampleRoutePath,
      )}). Skipping creation of example route.`,
    );
    return;
  }

  await fs.promises.writeFile(
    path.join(exampleRoutePath, '+page.svelte'),
    getSentryExampleSveltePage(projectProps),
  );

  await fs.promises.writeFile(
    path.join(exampleRoutePath, '+server.js'),
    getSentryExampleApiRoute(),
  );
}
