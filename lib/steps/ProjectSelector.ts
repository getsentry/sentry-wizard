import {prompt, Question, Answers} from 'inquirer';
import {BaseStep} from './Step';
import {dim} from '../Helper';

export default class ProjectSelector extends BaseStep {
  emit(answers?: Answers) {
    this.debug(answers);
    if (!answers || answers.wizard.projects.length == 0) {
      return Promise.reject('no projects');
    }

    return prompt([
      {
        type: 'list',
        name: 'project',
        message: 'Please select your project:',
        choices: answers.wizard.projects.map((project: any) => {
          return {name: `${project.organization.name} / ${project.name}`, value: project};
        })
      }
    ]);
  }
}
