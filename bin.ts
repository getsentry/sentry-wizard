#!/usr/bin/env node
import { IArgs, Platform, ProjectType } from './lib/Constants';
import { run } from './lib/Setup';
export * from './lib/Setup';

const argv = require('yargs')
  .boolean('debug')
  .boolean('uninstall')
  .option('type', {
    choices: Object.keys(ProjectType),
    describe: 'Choose a project type',
  })
  .option('platform', {
    choices: Object.keys(Platform),
    describe: 'Choose a platform',
  })
  .option('url', {
    alias: 'u',
    default: 'https://sentry.io/',
    describe: 'The url to your Sentry installation',
  }).argv;

run(argv as IArgs);
