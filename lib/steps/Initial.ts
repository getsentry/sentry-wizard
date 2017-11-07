import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { dim } from '../Helper';

let wizardPackage: any = {};
let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
  wizardPackage = require(`${process.cwd()}/node_modules/@sentry/setup-wizard/package.json`);
}

export class Initial extends BaseStep {
  emit(answers: Answers) {
    dim('Running Sentry Setup Wizard...');
    // TODO: get sentry cli version
    let sentryCliVersion = 'TODO';
    dim(`version: ${wizardPackage.version} | sentry-cli version: ${sentryCliVersion}`);
    return Promise.resolve({});
  }
}
