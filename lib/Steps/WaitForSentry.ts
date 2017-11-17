import { Answers } from 'inquirer';
import * as _ from 'lodash';
import { BottomBar } from '../Helper/BottomBar';
import { dim, green, l, nl } from '../Helper/Logging';
import { getCurrentProject } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';
import { BaseProject } from './Projects/BaseProject';
const r2 = require('r2');

export class WaitForSentry extends BaseStep {
  public async emit(answers: Answers) {
    if (!await getCurrentProject(answers).shouldEmit(answers)) {
      return {};
    }

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
