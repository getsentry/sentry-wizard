import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { BottomBar } from '../Helper/BottomBar';
import { dim, green, l, nl } from '../Helper/Logging';
import { getCurrentProject } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
import { BaseProject } from './Projects/BaseProject';
const open = require('open');
const r2 = require('r2');

export class OpenSentry extends BaseStep {
  public async emit(answers: Answers) {
    if (!await getCurrentProject(answers).shouldEmit(answers)) {
      dim('Skipping connection to sentry');
      return {};
    }

    const baseUrl = this.argv.url;

    BottomBar.show('Loading wizard...');
    this.debug(`Loading wizard for ${baseUrl}`);

    try {
      const data = await r2.get(`${baseUrl}api/0/wizard/`).json;

      BottomBar.hide();

      const urlToOpen = `${baseUrl}account/settings/wizard/${data.hash}/`;

      open(urlToOpen);
      nl();
      l('Please open');
      green(urlToOpen);
      l("in your browser (if it's not open already)");
      nl();

      return { hash: data.hash };
    } catch (e) {
      e.message = `\nWizard couldn't connect to ${baseUrl}\n
If you are running your own installation use --url \n\n${e.message}`;
      throw e;
    }
  }
}
