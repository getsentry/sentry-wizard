import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';
import * as _ from 'lodash';

import { dim } from '../Helper/Logging';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class PromptForParameters extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    this.debug(answers);
    if (!(await getCurrentIntegration(answers).shouldEmit(answers))) {
      return {};
    }
    if (this._argv.quiet) {
      return {};
    }

    let url = this._getFullUrl(answers);
    const organization: any = await prompt([
      {
        message: 'Organization Slug:',
        name: 'slug',
        type: 'input',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        validate: this._validateSlug,
        when: this._shouldAsk(answers, 'config.organization.slug', () => {
          dim('Please copy/paste your organization slug');
          dim(`It can be found in the url ${url}`);
        }),
      },
    ]);

    url = this._getFullUrl(answers, organization.slug);
    const project: any = await prompt([
      {
        message: 'Project Slug:',
        name: 'slug',
        type: 'input',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        validate: this._validateSlug,
        when: this._shouldAsk(answers, 'config.project.slug', () => {
          dim('Please copy/paste your project slug');
          dim(`It can be found in the url ${url}`);
        }),
      },
    ]);

    url = this._getFullUrl(answers, organization.slug, project.slug);
    const dsnKeyUrl = this._getDSNKeyUrl(answers, project.slug)
    const dsn = await prompt([
      {
        message: 'DSN:',
        name: 'public',
        type: 'input',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        validate: this._validateDSN,
        when: this._shouldAsk(answers, 'config.dsn.public', () => {
          dim('Please copy/paste your DSN');
          dim(`It can be found here: ${dsnKeyUrl}`);
        }),
      },
    ]);

    const auth = await prompt([
      {
        message: 'Auth Token:',
        name: 'token',
        type: 'input',
        // eslint-disable-next-line @typescript-eslint/unbound-method
        validate: this._validateAuthToken,
        when: this._shouldAsk(answers, 'config.auth.token', () => {
          dim('Please copy/paste your auth token');
          dim(`It can be found here: ${this._argv.url}api/`);
          dim(
            'In case there is none yet, create one with [project:releases] permission',
          );
        }),
      },
    ]);

    return {
      config: _.merge(_.get(answers, 'config'), {
        auth,
        dsn,
        project,
        organization,
      }),
    };
  }

  private _getFullUrl(
    answers: Answers,
    organizationSlug?: string,
    projectSlug?: string,
  ): string {
    const baseUrl = this._argv.url;
    const orgSlug = _.get(
      answers,
      'config.organization.slug',
      organizationSlug || 'organization_slug',
    );
    const projSlug = _.get(
      answers,
      'config.project.slug',
      projectSlug || 'project_slug',
    );
    return `${baseUrl}${orgSlug}/${projSlug}`;
  }

  private _getDSNKeyUrl(
    answers: Answers,
    projectSlug?: string,
  ): string {
    const baseUrl = this._argv.url;
    const projSlug = _.get(
      answers,
      'config.project.slug',
      projectSlug || 'project_slug',
    );
    return `${baseUrl}settings/projects/${projSlug}/keys`;
  }

  private _shouldAsk(
    answers: Answers,
    configKey: string,
    preHook?: () => void,
  ): boolean {
    const shouldAsk = _.get(answers, configKey, null) === null;
    if (shouldAsk && preHook) {
      preHook();
    }
    return shouldAsk;
  }

  private _validateAuthToken(input: string): boolean | string {
    const isOrgToken = input.startsWith('sntrys_');

    if (isOrgToken) {
      if (!isValidOrgToken(input)) {
        return 'Make sure you correctly copied your auth token. It should start with "sntrys_"';
      }
      return true;
    }

    if (!input.match(/(sntrys_)?[0-9a-f]{64}/g)) {
      return 'Make sure you copied the correct auth token, it should be 64 hex chars';
    }
    return true;
  }

  private _validateSlug(input: string): boolean | string {
    if (input.match(/[A-Z]/g)) {
      return 'Please copy the slug from the url, it should be all lowercase';
    }
    if (input.length === 0) {
      return "Can't be empty";
    }
    return true;
  }

  private _validateDSN(input: string): boolean | string {
    const match = input.match(
      /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w.-]+)(?::(\d+))?(\/.*)$/,
    );
    if (!match) {
      return 'Invalid DSN format';
    }
    if (match[1] !== 'http' && match[1] !== 'https') {
      return `Unsupported protocol for DSN: ${match[1]}`;
    }
    return true;
  }
}

type MaybeOrgAuthToken = {
  iat?: number;
  url?: string;
  org?: string;
  region_url?: string;
};

/**
 * Trying to parse and decode an org auth token. Based on:
 * - https://github.com/getsentry/rfcs/blob/main/text/0091-ci-upload-tokens.md#parsing-tokens
 * - https://github.com/getsentry/rfcs/blob/main/text/0091-ci-upload-tokens.md#token-facts
 */
function isValidOrgToken(input: string): boolean {
  if (!input.startsWith('sntrys_')) {
    return false;
  }

  const tokenParts = input.split('_');
  if (tokenParts.length < 3) {
    return false;
  }

  try {
    const payload = tokenParts[1];
    const decodedPayload = Buffer.from(payload, 'base64').toString();
    const jsonPayload = JSON.parse(decodedPayload) as MaybeOrgAuthToken;
    if (!jsonPayload.iat || !jsonPayload.url || !jsonPayload.org) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}
