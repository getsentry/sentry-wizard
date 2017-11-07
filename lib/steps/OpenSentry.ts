import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { l, green, dim, nl, BottomBar } from '../Helper';
import * as request from 'request-promise';
let open = require('open');

export class OpenSentry extends BaseStep {
  async emit(answers: Answers) {
    let baseUrl = this.argv.sentryUrl;

    BottomBar.show('Loading wizard...');
    this.debug(`Loading wizard for ${baseUrl}`);

    let data = JSON.parse(await request.get(`${baseUrl}api/0/wizard`));

    BottomBar.hide();

    let urlToOpen = `${baseUrl}account/settings/wizard/${data.hash}/`;

    open(urlToOpen);
    nl();
    l('Please open');
    green(urlToOpen);
    l("in your browser (if it's not open already)");
    nl();

    return Promise.resolve({ hash: data.hash });
  }
}
