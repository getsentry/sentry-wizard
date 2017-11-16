import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { dim } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class SentryProjectSelector extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(answers);

    if (_.has(answers, 'wizard.projects') && answers.wizard.projects.length === 0) {
      throw new Error('no projects');
    }

    if (answers.wizard.projects.length === 1) {
      return { selectedProject: answers.wizard.projects[0] };
    }

    return prompt([
      {
        choices: answers.wizard.projects.map((project: any) => {
          return {
            name: `${project.organization.name} / ${project.name}`,
            value: project,
          };
        }),
        message: 'Please select your project in Sentry:',
        name: 'selectedProject',
        type: 'list',
      },
    ]);
  }
}
