import { Answers } from 'inquirer';
import { BaseStep } from './Step';
import { l, green, dim, nl, BottomBar } from '../Helper';
import * as request from 'request-promise';

export class WaitForSentry extends BaseStep {
  async emit(answers: Answers) {
    return new Promise(async (resolve, reject) => {
      this.debug(answers);

      BottomBar.show('Waiting for Sentry...');
      let baseUrl = this.argv.sentryUrl;

      let that = this;
      function poll() {
        that
          .makeRequest(baseUrl, answers.hash)
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

  makeRequest(url: string, hash: string) {
    return request.get(`${url}api/0/wizard/${hash}/`);
  }
}
