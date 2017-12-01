import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import { isNull } from 'util';
import { dim } from '../Helper/Logging';
import { getCurrentProject } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class PromptForParameters extends BaseStep {
  public async emit(answers: Answers) {
    this.debug(answers);
    if (!await getCurrentProject(answers).shouldEmit(answers)) {
      return {};
    }
    const baseUrl = this.argv.url;

    dim('Please copy/paste your organization slug');
    dim(`It can be found in the url ${baseUrl}org_slug/project_slug`);
    const organization = await prompt([
      {
        message: 'Organization Slug:',
        name: 'slug',
        type: 'input',
        validate: this.validateSlug,
        when: isNull(_.get(answers, 'config.organization.slug', null)),
      },
    ]);

    dim('Please copy/paste your project slug');
    dim(`It can be found in the url ${baseUrl}${organization.slug}/project_slug`);
    const project = await prompt([
      {
        message: 'Project Slug:',
        name: 'slug',
        type: 'input',
        validate: this.validateSlug,
        when: isNull(_.get(answers, 'config.project.slug', null)),
      },
    ]);

    dim('Please copy/paste your DSN');
    dim(`It can be found here: ${baseUrl}${organization.slug}/${project.slug}`);
    const dsn = await prompt([
      {
        message: 'DSN:',
        name: 'secret',
        type: 'input',
        validate: this.validateDSN,
        when: isNull(_.get(answers, 'config.dsn.secret', null)),
      },
    ]);

    dim('Please copy/paste your auth token');
    dim(`It can be found here: ${baseUrl}api/`);
    dim('In case there is none yet, create one with [project:releases] permission');
    const auth = await prompt([
      {
        message: 'Auth Token:',
        name: 'token',
        type: 'input',
        when: isNull(_.get(answers, 'config.auth.token', null)),
      },
    ]);

    return { auth, dsn, project, organization };
  }

  private validateSlug(input: string) {
    if (input.match(/[A-Z]/g)) {
      return 'Please copy the slug from the url, it should be all lowercase';
    }
    if (input.length === 0) {
      return 'Can\'t be empty';
    }
    return true;
  }

  private validateDSN(input: string) {
    const match = input.match(
      /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)$/
    );
    if (!match) {
      return 'Invalid DSN format';
    }
    if (match[1] !== 'http' && match[1] !== 'https') {
      return 'Unsupported protocol for DSN: ' + match[1];
    }
    if (!match[3]) {
      return 'Missing secret in DSN';
    }
    return true;
  }
}
