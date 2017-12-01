import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { getIntegrationChoices, Integration } from '../Constants';
import { dim, green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';
import { Cordova } from './Projects/Cordova';
import { GenericJavascript } from './Projects/GenericJavascript';
import { GenericNode } from './Projects/GenericNode';
import { ReactNative } from './Projects/ReactNative';

let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

export class ChooseIntegration extends BaseStep {
  public async emit(answers: Answers) {
    // If we receive project type as an arg we skip asking
    let integrationPrompt = null;
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
      case Integration.node:
        integration = new GenericNode(this.argv);
        break;
      default:
        integration = new GenericJavascript(this.argv);
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
