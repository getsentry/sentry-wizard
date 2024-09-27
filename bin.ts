#!/usr/bin/env node
import { satisfies } from 'semver';
import { red } from './lib/Helper/Logging';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const NODE_VERSION_RANGE = '>=14.18.0';

// Have to run this above the other imports because they are importing clack that
// has the problematic imports.
if (!satisfies(process.version, NODE_VERSION_RANGE)) {
  red(
    `Sentry wizard requires Node.js ${NODE_VERSION_RANGE}. You are using Node.js ${process.version}. Please upgrade your Node.js version.`,
  );
  process.exit(1);
}

import { Integration, Platform } from './lib/Constants';
import { run } from './src/run';

export * from './lib/Setup';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const argv = yargs(hideBin(process.argv))
  .option('debug', {
    default: false,
    describe: 'Enable verbose logging\nenv: SENTRY_WIZARD_DEBUG',
    type: 'boolean',
  })
  .option('uninstall', {
    default: false,
    describe: 'Revert project setup process\nenv: SENTRY_WIZARD_UNINSTALL',
    type: 'boolean',
  })
  .option('skip-connect', {
    default: false,
    describe:
      'Skips the connection to the server\nenv: SENTRY_WIZARD_SKIP_CONNECT',
    type: 'boolean',
  })
  .option('quiet', {
    default: false,
    describe:
      'Do not fallback to prompting user asking questions\nenv: SENTRY_WIZARD_QUIET',
    type: 'boolean',
  })
  .option('i', {
    alias: 'integration',
    choices: Object.keys(Integration),
    describe: 'Choose the integration to setup\nenv: SENTRY_WIZARD_INTEGRATION',
  })
  .option('p', {
    alias: 'platform',
    choices: Object.keys(Platform),
    describe: 'Choose platform(s)\nenv: SENTRY_WIZARD_PLATFORM',
    type: 'array',
  })
  .option('u', {
    alias: 'url',
    describe: 'The url to your Sentry installation\nenv: SENTRY_WIZARD_URL',
  })
  .option('saas', {
    default: false,
    describe: 'If set, skip the self-hosted or SaaS URL selection process',
    type: 'boolean',
  })
  .option('s', {
    alias: 'signup',
    default: false,
    describe: 'Redirect to signup page if not logged in',
    type: 'boolean',
  })
  .option('disable-telemetry', {
    default: false,
    describe: "Don't send telemetry data to Sentry",
    type: 'boolean',
  })
  .option('promo-code', {
    alias: 'promo-code',
    describe: 'A promo code that will be applied during signup',
    type: 'string',
  }).argv;

// @ts-expect-error - for some reason TS doesn't recognize the aliases as valid properties
// meaning it only knows e.g. u but not url. Maybe a bug in this old version of yargs?
// Can't upgrade yargs though without dropping support for Node 14.
void run(argv);
