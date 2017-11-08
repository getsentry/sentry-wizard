import { Answers } from 'inquirer';
import * as request from 'request-promise';
import { BottomBar, dim, green, l, nl } from '../Helper';
import { BaseStep } from './Step';

export class WaitForSentry extends BaseStep {
  public async emit(answers: Answers) {
    return new Promise(async (resolve, reject) => {
      this.debug(answers);

      BottomBar.show('Waiting for Sentry...');
      const baseUrl = this.argv.url;

      function poll() {
        request
          .get(`${baseUrl}api/0/wizard/${answers.hash}/`)
          .then(async (data: any) => {
            // Delete the wizard hash since we were able to fetch the data
            await request.delete(`${baseUrl}api/0/wizard/${answers.hash}/`);
            BottomBar.hide();
            resolve({ wizard: JSON.parse(data) });
          })
          .catch((error: any) => {
            setTimeout(poll, 1000);
          });
      }
      poll();
    });
  }
}
