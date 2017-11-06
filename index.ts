import {setupCordova} from './lib/Setup';
const argv = require('yargs').boolean('debug').argv;

setupCordova(argv);
