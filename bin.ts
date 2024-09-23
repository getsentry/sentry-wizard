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

const PRESELECTED_PROJECT_OPTIONS = {
  'preSelectedProject.authToken': {
    describe: 'Preselected project auth token',
  },
  'preSelectedProject.selfHosted': {
    describe: 'Preselected project is self-hosted',
  },
  'preSelectedProject.dsn': {
    describe: 'Preselected project DSN',
  },
  'preSelectedProject.id': {
    describe: 'Preselected project id',
  },
  'preSelectedProject.projectSlug': {
    describe: 'Preselected project slug',
  },
  'preSelectedProject.projectName': {
    describe: 'Preselected project name',
  },
  'preSelectedProject.orgId': {
    describe: 'Preselected organization id',
  },
  'preSelectedProject.orgName': {
    describe: 'Preselected organization name',
  },
  'preSelectedProject.orgSlug': {
    describe: 'Preselected organization slug',
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const argv = yargs(hideBin(process.argv)).options({
  debug: {
    default: false,
    describe: 'Enable verbose logging\nenv: SENTRY_WIZARD_DEBUG',
    type: 'boolean',
  },
  uninstall: {
    default: false,
    describe: 'Revert project setup process\nenv: SENTRY_WIZARD_UNINSTALL',
    type: 'boolean',
  },
  'skip-connect': {
    default: false,
    describe:
      'Skips the connection to the server\nenv: SENTRY_WIZARD_SKIP_CONNECT',
    type: 'boolean',
  },
  quiet: {
    default: false,
    describe:
      'Do not fallback to prompting user asking questions\nenv: SENTRY_WIZARD_QUIET',
    type: 'boolean',
  },
  i: {
    alias: 'integration',
    choices: Object.keys(Integration),
    describe: 'Choose the integration to setup\nenv: SENTRY_WIZARD_INTEGRATION',
  },
  p: {
    alias: 'platform',
    choices: Object.keys(Platform),
    describe: 'Choose platform(s)\nenv: SENTRY_WIZARD_PLATFORM',
    type: 'array',
  },
  u: {
    alias: 'url',
    describe: 'The url to your Sentry installation\nenv: SENTRY_WIZARD_URL',
  },
  s: {
    alias: 'signup',
    default: false,
    describe: 'Redirect to signup page if not logged in',
    type: 'boolean',
  },
  'disable-telemetry': {
    default: false,
    describe: "Don't send telemetry data to Sentry",
    type: 'boolean',
  },
  'promo-code': {
    alias: 'promo-code',
    describe: 'A promo code that will be applied during signup',
    type: 'string',
  },
  ...PRESELECTED_PROJECT_OPTIONS,
}).argv;

// @ts-expect-error - for some reason TS doesn't recognize the aliases as valid properties
// meaning it only knows e.g. u but not url. Maybe a bug in this old version of yargs?
// Can't upgrade yargs though without dropping support for Node 14.
void run(argv);
