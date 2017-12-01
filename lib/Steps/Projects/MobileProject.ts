import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import { isArray } from 'util';
import { getPlatformChoices, Platform } from '../../Constants';
import { dim } from '../../Helper/Logging';
import { BaseProject } from './BaseProject';

export abstract class MobileProject extends BaseProject {
  protected platforms: Platform[];

  public getPlatforms(answers: Answers) {
    if (!_.has(answers, 'shouldConfigurePlatforms')) {
      throw new Error('No platform selected');
    }
    const shouldConfigurePlatforms = _.get(answers, 'shouldConfigurePlatforms');
    return _.keys(_.pickBy(shouldConfigurePlatforms, (active: boolean) => active));
  }

  public async shouldConfigure(answers: Answers) {
    if (_.get(answers, 'shouldConfigurePlatforms')) {
      return _.get(answers, 'shouldConfigurePlatforms');
    }
    const isPlatformSet =
      this.argv.platform && isArray(this.argv.platform) && this.argv.platform.length;

    this.platforms = isPlatformSet
      ? this.argv.platform
      : (await this.platformSelector()).platform;

    const shouldConfigurePlatforms: any = {};
    _.keys(Platform).forEach(async (platform: Platform) => {
      shouldConfigurePlatforms[platform] =
        _.indexOf(this.platforms, platform) >= 0
          ? await this.shouldConfigurePlatform(platform)
          : false;
      if (shouldConfigurePlatforms[platform] === false && this.argv.uninstall === false) {
        dim(`will not configure ${platform}`);
      }
    });
    return { shouldConfigurePlatforms };
  }

  protected abstract shouldConfigurePlatform(platform: Platform): Promise<boolean>;

  protected platformSelector() {
    if (this.argv.quiet) {
      throw new Error('You need to choose a platform');
    }
    return prompt([
      {
        choices: getPlatformChoices(),
        message: 'Select the platforms you like to setup:',
        name: 'platform',
        type: 'checkbox',
      },
    ]);
  }
}
