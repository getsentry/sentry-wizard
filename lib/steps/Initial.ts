import { Answers } from 'inquirer';
import { dim } from '../Helper';
import { BaseStep } from './Step';

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
  public async emit(answers: Answers) {
    dim('Running Sentry Setup Wizard...');
    // TODO: get sentry cli version
    const sentryCliVersion = 'TODO';
    dim(`version: ${wizardPackage.version} | sentry-cli version: ${sentryCliVersion}`);
    return {};
  }
}
