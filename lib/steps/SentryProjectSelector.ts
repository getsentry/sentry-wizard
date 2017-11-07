import * as _ from 'lodash';
import { prompt, Question, Answers } from 'inquirer';
import { BaseStep } from './Step';
import { dim } from '../Helper';

export class SentryProjectSelector extends BaseStep {
  emit(answers: Answers) {
    this.debug(answers);

    if (_.has(answers, 'wizard.projects') && answers.wizard.projects.length === 0) {
      return Promise.reject('no projects');
    }

    if (answers.wizard.projects.length === 1) {
      return Promise.resolve({ selectedProject: answers.wizard.projects[0] });
    }

    return prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: 'Please select your project in Sentry:',
        choices: answers.wizard.projects.map((project: any) => {
          return {
            name: `${project.organization.name} / ${project.name}`,
            value: project
          };
        })
      }
    ]);
  }
}
