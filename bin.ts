#!/usr/bin/env node
import { IArgs, Platform, ProjectType } from './lib/Constants';
import { run } from './lib/Setup';
export * from './lib/Setup';

const argv = require('yargs')
  .boolean('debug')
  .boolean('uninstall')
  .option('t', {
    alias: 'type',
    choices: Object.keys(ProjectType),
    describe: 'Choose a project type',
  })
  .option('p', {
    alias: 'platform',
    choices: Object.keys(Platform),
    describe: 'Choose platform(s)',
    type: 'array',
  })
  .option('u', {
    alias: 'url',
    default: 'https://sentry.io/',
    describe: 'The url to your Sentry installation',
  }).argv;

run(argv as IArgs);
