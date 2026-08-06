// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates a basic wrangler.jsonc config file for a Cloudflare Worker
 */
export function createWranglerConfig(): void {
  const configPath = path.join(process.cwd(), 'wrangler.jsonc');

  const config = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: 'my-worker',
    main: 'src/index.ts',
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  clack.log.success(
    `Created ${chalk.cyan('wrangler.jsonc')} configuration file.`,
  );
  clack.log.info(
    `Please update the ${chalk.cyan('name')} and ${chalk.cyan(
      'main',
    )} fields in ${chalk.cyan(
      'wrangler.jsonc',
    )} to match your worker name and entry point.`,
  );
}
