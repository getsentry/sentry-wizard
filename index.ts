import { IArgs, ProjectType } from './lib/Constants';
import { run } from './lib/Setup';

const argv = require('yargs')
  .boolean('debug')
  .boolean('uninstall')
  .option('type', {
    choices: Object.keys(ProjectType),
    describe: 'Choose a project type'
  })
  .option('url', {
    alias: 'u',
    default: 'https://sentry.io/',
    describe: 'The url to your Sentry installation'
  }).argv;

run(argv as IArgs);
