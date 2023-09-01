import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';

import { BaseStep } from './BaseStep';

function sleep(n: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, n));
}

export class SentryProjectSelector extends BaseStep {
  public async emit(answers: Answers): Promise<any> {
    this.debug(answers);

    if (!_.has(answers, 'wizard')) {
      // we skip this completly because the wizard wasn't running
      return {};
    }

    if (
      _.has(answers, 'wizard.projects') &&
      answers.wizard.projects.length === 0
    ) {
      throw new Error(
        'No Projects found. Please create a new Project in Sentry and try again.',
      );
    }

    let selectedProject = null;
    if (answers.wizard.projects.length === 1) {
      selectedProject = { selectedProject: answers.wizard.projects[0] };
      // the wizard CLI closes too quickly when we skip the prompt
      // as it will cause the UI to be stuck saying Waiting for wizard to connect
      await sleep(1000);
    } else {
      selectedProject = await prompt([
        {
          choices: answers.wizard.projects.map((project: any) => {
            return {
              name: `${project.organization.name} / ${project.slug}`,
              value: project,
            };
          }),
          message: 'Please select your project in Sentry:',
          name: 'selectedProject',
          type: 'list',
        },
      ]);
    }

    return {
      config: {
        auth: {
          token: _.get(answers, 'wizard.apiKeys.token', null),
        },
        dsn: {
          public: _.get(
            selectedProject,
            'selectedProject.keys.0.dsn.public',
            null,
          ),
          secret: _.get(
            selectedProject,
            'selectedProject.keys.0.dsn.secret',
            null,
          ),
        },
        organization: {
          slug: _.get(
            selectedProject,
            'selectedProject.organization.slug',
            null,
          ),
        },
        project: {
          id: _.get(selectedProject, 'selectedProject.id', null),
          slug: _.get(selectedProject, 'selectedProject.slug', null),
        },
      },
    };
  }
}
