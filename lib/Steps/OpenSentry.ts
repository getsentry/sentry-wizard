import { Answers } from 'inquirer';

import { BottomBar } from '../Helper/BottomBar';
import { dim, green, l, nl, red } from '../Helper/Logging';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

const opn = require('opn');
const r2 = require('r2');

export class OpenSentry extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    if (!(await getCurrentIntegration(answers).shouldEmit(answers))) {
      dim('Skipping connection to Sentry due files already patched');
      return {};
    }
    if (this._argv.skipConnect) {
      dim('Skipping connection to Sentry');
      return {};
    }

    const baseUrl = this._argv.url;

    BottomBar.show('Loading wizard...');
    this.debug(`Loading wizard for ${baseUrl}`);

    try {
      const data = await r2.get(`${baseUrl}api/0/wizard/`).json;

      BottomBar.hide();

      const urlToOpen = `${baseUrl}account/settings/wizard/${data.hash}/`;

      opn(urlToOpen);
      nl();
      l('Please open');
      green(urlToOpen);
      l("in your browser (if it's not open already)");
      nl();

      return { hash: data.hash };
    } catch (e) {
      this._argv.skipConnect = true;
      BottomBar.hide();
      nl();
      red(
        `Wizard couldn't connect to ${baseUrl}\nmake sure the url is correct`,
      );
      l(
        'But no worries, we fall back to asking you stuff instead, so here we go:',
      );
      return {};
    }
  }
}
