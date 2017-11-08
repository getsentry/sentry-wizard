import { Answers } from 'inquirer';
import { BottomBar, dim, green, l, nl } from '../Helper';
import { BaseStep } from './Step';
const r2 = require('r2');

export class WaitForSentry extends BaseStep {
  public async emit(answers: Answers) {
    return new Promise(async (resolve, reject) => {
      this.debug(answers);

      BottomBar.show('Waiting for Sentry...');
      const baseUrl = this.argv.url;

      async function poll() {
        try {
          const data = await r2.get(`${baseUrl}api/0/wizard/${answers.hash}/`).json;
          // Delete the wizard hash since we were able to fetch the data
          await r2.delete(`${baseUrl}api/0/wizard/${answers.hash}/`);
          BottomBar.hide();
          resolve({ wizard: data });
        } catch (e) {
          setTimeout(poll, 1000);
        }
      }
      poll();
    });
  }
}
