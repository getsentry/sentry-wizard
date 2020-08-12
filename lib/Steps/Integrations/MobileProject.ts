import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';

import { getPlatformChoices, Platform } from '../../Constants';
import { dim } from '../../Helper/Logging';
import { BaseIntegration } from './BaseIntegration';

export abstract class MobileProject extends BaseIntegration {
  protected _platforms: Platform[];

  public getPlatforms(answers: Answers): string[] {
    if (!_.has(answers, 'shouldConfigurePlatforms')) {
      throw new Error('No platform selected');
    }
    const shouldConfigurePlatforms = _.get(answers, 'shouldConfigurePlatforms');
    return _.keys(
      _.pickBy(shouldConfigurePlatforms, (active: boolean) => active),
    );
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    if (_.get(answers, 'shouldConfigurePlatforms')) {
      return _.get(answers, 'shouldConfigurePlatforms');
    }
    const isPlatformSet =
      this._argv.platform &&
      Array.isArray(this._argv.platform) &&
      this._argv.platform.length;

    this._platforms = isPlatformSet
      ? this._argv.platform
      : (await this._platformSelector()).platform;

    const shouldConfigurePlatforms: any = {};
    _.keys(Platform).forEach(async (platform: Platform) => {
      shouldConfigurePlatforms[platform] =
        _.indexOf(this._platforms, platform) >= 0
          ? await this._shouldConfigurePlatform(platform)
          : false;
      if (
        shouldConfigurePlatforms[platform] === false &&
        this._argv.uninstall === false
      ) {
        dim(`will not configure ${platform}`);
      }
    });
    return { shouldConfigurePlatforms };
  }

  protected _platformSelector(): Promise<Answers> {
    if (this._argv.quiet) {
      throw new Error('You need to choose a platform');
    }
    return prompt([
      {
        choices: getPlatformChoices(),
        message: 'Select the platforms you like to set up:',
        name: 'platform',
        type: 'checkbox',
      },
    ]);
  }

  protected abstract _shouldConfigurePlatform(
    platform: Platform,
  ): Promise<boolean>;
}
