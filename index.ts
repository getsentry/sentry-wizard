import { ProjectType } from './lib/steps';
import { run } from './lib/Setup';
const argv = require('yargs')
  .boolean('debug')
  .option('projectType', {
    alias: 'pt',
    describe: 'Choose a project type',
    choices: Object.keys(ProjectType)
  }).argv;

run(argv);
