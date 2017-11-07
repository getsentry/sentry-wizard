import { run } from './lib/Setup';
const argv = require('yargs').boolean('debug').argv;

run(argv);
