import { Answers } from 'inquirer';
import { BottomBar, dim, green, l, nl } from '../Helper';
import { BaseStep } from './Step';
const open = require('open');
const r2 = require('r2');

export class OpenSentry extends BaseStep {
  public async emit(answers: Answers) {
    const baseUrl = this.argv.url;

    BottomBar.show('Loading wizard...');
    this.debug(`Loading wizard for ${baseUrl}`);

    try {
      const data = await r2.get(`${baseUrl}api/0/wizard`).json;

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
      throw e;
    }
  }
}
