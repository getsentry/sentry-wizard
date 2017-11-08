import { IArgs, ProjectType } from './lib/Constants';
import { run } from './lib/Setup';

const argv = require('yargs')
  .boolean('debug')
  .option('type', {
    choices: Object.keys(ProjectType),
    describe: 'Choose a project type'
  })
  .option('url', {
    alias: 'u',
    default: 'https://sentry.io/'
  }).argv;

run(argv as IArgs);
