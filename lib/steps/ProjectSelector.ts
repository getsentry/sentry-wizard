import {prompt, Question, Answers} from 'inquirer';
import {BaseStep} from './Step';
import {dim} from '../Helper';

export default class ProjectSelector extends BaseStep {
  emit(answers?: Answers) {
    this.debug(answers);
    return prompt([
      {
        type: 'list',
        name: 'project',
        message: 'Please select your project:',
        choices: [
          {name: 'Sentry / Sentry - Test', value: '1'},
          {name: 'Sentry / iOS', value: '2'},
          {name: 'Sentry / Android', value: '3'}
        ]
      }
    ]);
  }
}
