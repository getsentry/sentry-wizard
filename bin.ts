#!/usr/bin/env node
import { IArgs, Integration, Platform } from './lib/Constants';
import { run } from './lib/Setup';
export * from './lib/Setup';
const readEnv = require('read-env').default;

const argv = require('yargs')
  .option('debug', {
    describe: 'Enable verbose logging\nenv: SENTRY_WIZARD_DEBUG',
    type: 'boolean',
  })
  .option('uninstall', {
    describe: 'Revert project setup process\nenv: SENTRY_WIZARD_UNINSTALL',
    type: 'boolean',
  })
  .option('skip-connect', {
    describe: 'Skips the connection to the server\nenv: SENTRY_WIZARD_SKIP_CONNECT',
    type: 'boolean',
  })
  .option('quiet', {
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
    default: 'https://sentry.io/',
    describe: 'The url to your Sentry installation\nenv: SENTRY_WIZARD_URL',
  }).argv;

run({ ...argv, ...readEnv('SENTRY_WIZARD') });
