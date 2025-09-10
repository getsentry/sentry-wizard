import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';

import {
  EXAMPLE_PAGE_TEMPLATE_TSX,
  EXAMPLE_PAGE_TEMPLATE_JSX,
} from './templates';

/**
 * Creates an example page that demonstrates Sentry error handling in React Router v7
 */
export function createExamplePage(projectDir: string): void {
  try {
    const routesDir = path.join(projectDir, 'app', 'routes');

    // Check if routes directory exists
    if (!fs.existsSync(routesDir)) {
      clack.log.warn(
        chalk.yellow(
          'Routes directory not found. Skipping example page creation.',
        ),
      );
      return;
    }

    // Determine if project uses TypeScript
    const hasTypeScript = fs.existsSync(path.join(projectDir, 'tsconfig.json'));
    const fileExtension = hasTypeScript ? '.tsx' : '.jsx';
    const template = hasTypeScript
      ? EXAMPLE_PAGE_TEMPLATE_TSX
      : EXAMPLE_PAGE_TEMPLATE_JSX;

    const examplePagePath = path.join(
      routesDir,
      `sentry-example-page${fileExtension}`,
    );

    // Check if example page already exists
    if (fs.existsSync(examplePagePath)) {
      clack.log.warn(
        chalk.yellow('Sentry example page already exists. Skipping creation.'),
      );
      return;
    }

    // Create the example page
    fs.writeFileSync(examplePagePath, template);

    clack.log.success(
      chalk.green(
        `Created example page at ${chalk.cyan(
          path.relative(projectDir, examplePagePath),
        )}`,
      ),
    );

    clack.log.info(
      chalk.blue(
        'Visit /sentry-example-page in your browser to test Sentry error reporting.',
      ),
    );
  } catch (error) {
    clack.log.error(
      `${chalk.red('Failed to create example page:')} ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
