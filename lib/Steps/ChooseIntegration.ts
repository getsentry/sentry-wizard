import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { getIntegrationChoices, Integration } from '../Constants';
import { dim, green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { Cordova } from './Integrations/Cordova';
import { Electron } from './Integrations/Electron';
import { ReactNative } from './Integrations/ReactNative';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export class ChooseIntegration extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    // If we receive project type as an arg we skip asking
    let integrationPrompt: any = null;
    if (this.argv.integration) {
      integrationPrompt = { integration: this.argv.integration };
    } else {
      if (this.argv.quiet) {
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
        integration = new ReactNative(this.argv);
        break;
      case Integration.cordova:
        integration = new Cordova(this.argv);
        break;
      case Integration.electron:
        integration = new Electron(this.argv);
        break;
      default:
        integration = new ReactNative(this.argv);
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
