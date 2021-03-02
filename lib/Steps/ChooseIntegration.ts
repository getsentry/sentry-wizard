import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';

import { getIntegrationChoices, Integration } from '../Constants';
import { BaseStep } from './BaseStep';
import { Cordova } from './Integrations/Cordova';
import { Electron } from './Integrations/Electron';
import { NextJs } from './Integrations/NextJs';
import { ReactNative } from './Integrations/ReactNative';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export class ChooseIntegration extends BaseStep {
  public async emit(_answers: Answers): Promise<Answers> {
    // If we receive project type as an arg we skip asking
    let integrationPrompt: any = null;
    if (this._argv.integration) {
      integrationPrompt = { integration: this._argv.integration };
    } else {
      if (this._argv.quiet) {
        throw new Error('You need to choose a integration');
      }
      integrationPrompt = this.tryDetectingIntegration();
      integrationPrompt = await prompt([
        {
          choices: getIntegrationChoices(),
          default: integrationPrompt,
          message: 'What integration do you want to set up?',
          name: 'integration',
          type: 'list',
        },
      ]);
    }

    let integration = null;
    switch (integrationPrompt.integration) {
      case Integration.reactNative:
        integration = new ReactNative(this._argv);
        break;
      case Integration.cordova:
        integration = new Cordova(this._argv);
        break;
      case Integration.electron:
        integration = new Electron(this._argv);
        break;
      case Integration.nextjs:
        integration = new NextJs(this._argv);
        break;
      default:
        integration = new ReactNative(this._argv);
        break;
    }

    return { integration };
  }

  public tryDetectingIntegration(): Integration | undefined {
    if (_.has(projectPackage, 'dependencies.react-native')) {
      return Integration.reactNative;
    }
    if (_.has(projectPackage, 'dependencies.cordova')) {
      return Integration.cordova;
    }
    return;
  }
}
