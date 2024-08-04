/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';

import {
  Args,
  DEFAULT_URL,
  getIntegrationChoices,
  Integration,
} from '../Constants';
import { BaseStep } from './BaseStep';
import { Cordova } from './Integrations/Cordova';
import { Electron } from './Integrations/Electron';
import { hasPackageInstalled } from '../../src/utils/package-json';
import { dim } from '../Helper/Logging';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      case Integration.cordova:
        integration = new Cordova(sanitizeUrl(this._argv));
        break;
      case Integration.electron:
        integration = new Electron(sanitizeUrl(this._argv));
        break;
    }

    return { integration };
  }

  public tryDetectingIntegration(): Integration | undefined {
    if (hasPackageInstalled('react-native', projectPackage)) {
      return Integration.reactNative;
    }
    if (hasPackageInstalled('cordova', projectPackage)) {
      return Integration.cordova;
    }
    if (hasPackageInstalled('electron', projectPackage)) {
      return Integration.electron;
    }
    if (hasPackageInstalled('next', projectPackage)) {
      return Integration.nextjs;
    }
    if (hasPackageInstalled('remix-run', projectPackage)) {
      return Integration.remix;
    }
    if (hasPackageInstalled('@sveltejs/kit', projectPackage)) {
      return Integration.sveltekit;
    }

    return;
  }

  private async _getIntegrationPromptSelection(): Promise<IntegrationPromptAnswer> {
    // If we receive project type as an arg we skip asking
    if (this._argv.integration) {
      return { integration: this._argv.integration };
    } else {
      if (this._argv.quiet) {
        throw new Error('You need to choose a platform');
      }

      const detectedDefaultSelection = this.tryDetectingIntegration();

      return prompt([
        {
          choices: getIntegrationChoices(),
          default: detectedDefaultSelection,
          message: 'What platform do you want to set up?',
          name: 'integration',
          type: 'list',
          pageSize: 10,
        },
      ]);
    }
  }
}

/**
 * For the `clack`-based wizard flows, which we only shim here, we don't set
 * a default url value. For backwards-compatibility with the other flows,
 * we fill it here and sanitize a user-enterd url.
 */
function sanitizeUrl(argv: Args): Args {
  if (!argv.url) {
    argv.url = DEFAULT_URL;
    dim(`no URL provided, fallback to ${argv.url}`);
    return argv;
  }

  let baseUrl = argv.url;
  baseUrl += baseUrl.endsWith('/') ? '' : '/';
  baseUrl = baseUrl.replace(/:\/(?!\/)/g, '://');
  argv.url = baseUrl;

  return argv;
}
