import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';

import { getIntegrationChoices, Integration } from '../Constants';
import { BaseStep } from './BaseStep';
import { Cordova } from './Integrations/Cordova';
import { Electron } from './Integrations/Electron';
import { NextJsShim } from './Integrations/NextJsShim';
import { ReactNative } from './Integrations/ReactNative';
import { SourceMapsShim } from './Integrations/SourceMapsShim';
import { Apple } from './Integrations/Apple';
import { SvelteKitShim } from './Integrations/SvelteKitShim';


let projectPackage: any = {};

try {
  // If we run directly in setup-wizard
  projectPackage = require('../../package.json');
} catch {
  projectPackage = require(`${process.cwd()}/package.json`);
}

type IntegrationPromptAnswer = {
  integration: Integration;
};

export class ChooseIntegration extends BaseStep {
  public async emit(_answers: Answers): Promise<Answers> {
    const integrationPrompt = await this._getIntegrationPromptSelection();

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
        integration = new NextJsShim(this._argv);
        break;
      case Integration.sveltekit:
        integration = new SvelteKitShim(this._argv);
        break;
      case Integration.sourcemaps:
        integration = new SourceMapsShim(this._argv);
        break;
      case Integration.ios:
        integration = new Apple(this._argv);
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

  private async _getIntegrationPromptSelection(): Promise<IntegrationPromptAnswer> {
    // If we receive project type as an arg we skip asking
    if (this._argv.integration) {
      return { integration: this._argv.integration };
    } else {
      if (this._argv.quiet) {
        throw new Error('You need to choose a integration');
      }

      const detectedDefaultSelection = this.tryDetectingIntegration();

      return prompt([
        {
          choices: getIntegrationChoices(),
          default: detectedDefaultSelection,
          message: 'What integration do you want to set up?',
          name: 'integration',
          type: 'list',
        },
      ]);
    }
  }
}
