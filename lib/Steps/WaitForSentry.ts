import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { BottomBar } from '../Helper/BottomBar';
import { debug, dim, green, l, nl } from '../Helper/Logging';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
const r2 = require('r2');

export class WaitForSentry extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    if (!await getCurrentIntegration(answers).shouldEmit(answers)) {
      return {};
    }
    if (this.argv.skipConnect) {
      return {};
    }

    return new Promise(async (resolve, reject) => {
      this.debug(answers);

      BottomBar.show('Waiting for Sentry...');
      const baseUrl = this.argv.url;

      const polling = async () => {
        try {
          this.debug(`Polling: ${baseUrl}api/0/wizard/${answers.hash}/`);
          const response = await r2.get(`${baseUrl}api/0/wizard/${answers.hash}/`)
            .response;
          this.debug(`Polling received data`);
          if (response.status !== 200) {
            throw new Error(`Received status ${response.status}`);
          }
          const data = await response.json();
          // Delete the wizard hash since we were able to fetch the data
          await r2.delete(`${baseUrl}api/0/wizard/${answers.hash}/`);
          BottomBar.hide();
          this.debug(`Polling Success!`);
          resolve({ wizard: data });
        } catch (e) {
          this.debug('Polling received:');
          this.debug(e);
          setTimeout(polling.bind(this), 1000);
        }
      };
      polling.bind(this)();
    });
  }
}
