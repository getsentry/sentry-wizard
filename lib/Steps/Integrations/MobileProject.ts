import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';

import { getPlatformChoices, Platform } from '../../Constants';
import { dim } from '../../Helper/Logging';
import { BaseIntegration } from './BaseIntegration';

export abstract class MobileProject extends BaseIntegration {
  protected _platforms: Platform[];

  public getPlatforms(answers: Answers): string[] {
    if (!answers.shouldConfigurePlatforms) {
      throw new Error('No platform selected');
    }
    const shouldConfigurePlatforms =
      answers.shouldConfigurePlatforms as Partial<Record<Platform, boolean>>;
    return Object.entries(shouldConfigurePlatforms)
      .filter((pair) => pair[1])
      .map((pair) => pair[0]); // only return the keys
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    let { shouldConfigurePlatforms } = answers as {
      shouldConfigurePlatforms?: Partial<Record<Platform, boolean>>;
    };
    if (shouldConfigurePlatforms) {
      return { shouldConfigurePlatforms };
    }

    const isPlatformSet =
      this._argv.platform &&
      Array.isArray(this._argv.platform) &&
      this._argv.platform.length;

    this._platforms = isPlatformSet
      ? this._argv.platform
      : (await this._platformSelector()).platform;

    shouldConfigurePlatforms = {};
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    for (const platform of Object.values(Platform)) {
      shouldConfigurePlatforms[platform] = this._platforms.includes(platform)
        ? await this._shouldConfigurePlatform(platform)
        : false;
      if (
        shouldConfigurePlatforms[platform] === false &&
        this._argv.uninstall === false
      ) {
        dim(`will not configure ${platform}`);
      }
    }
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
