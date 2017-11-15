import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { IArgs } from '../../Constants';
import { dim, green, l, nl, red } from '../../Helper';
import { BaseStep } from '../Step';
import { patchMatchingFile } from './FileHelper';
import { SentryCliHelper } from './SentryCliHelper';

export class Cordova extends BaseStep {
  protected answers: Answers;
  protected platforms: string[];
  protected sentryCliHelper: SentryCliHelper;
  protected folderPrefix = 'platforms';

  constructor(protected argv: IArgs) {
    super(argv);
    this.sentryCliHelper = new SentryCliHelper(this.argv);
  }

  public async emit(answers: Answers) {
    if (this.argv.uninstall) {
      //   return this.uninstall();
    }
    const sentryCliProperties = this.sentryCliHelper.convertSelectedProjectToProperties(
      answers
    );
    return ['ios', 'android'].map(async (platform: string) => {
      try {
        await this.addSentryProperties(platform, sentryCliProperties);
        green(`Successfully setup ${platform} for cordova`);
      } catch (e) {
        red(e);
      }
    });

    // return new Promise(async (resolve, reject) => {
    //   this.answers = answers;
    //   this.platforms = (await this.platformSelector()).platform;
    //   const promises = this.platforms.map((platform: string) =>
    //     this.shouldConfigurePlatform(platform).then(async () => {

    //     })
    //   );
    // });
  }

  private addSentryProperties(platform: string, properties: any) {
    let rv = Promise.resolve();
    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise

    if (!fs.existsSync(this.folderPrefix)) {
      dim(`${this.folderPrefix} folder did not exist, creating it.`);
      fs.mkdirSync(this.folderPrefix);
    }
    if (!fs.existsSync(path.join(this.folderPrefix, platform))) {
      dim(`${platform} folder did not exist, creating it.`);
      fs.mkdirSync(path.join(this.folderPrefix, platform));
    }
    const fn = path.join(this.folderPrefix, platform, 'sentry.properties');

    rv = rv.then(() =>
      fs.writeFileSync(fn, this.sentryCliHelper.dumpProperties(properties))
    );

    return rv;
  }

  private shouldConfigurePlatform(platform: string) {
    // if a sentry.properties file exists for the platform we want to configure
    // without asking the user.  This means that re-linking later will not
    // bring up a useless dialog.

    if (
      fs.existsSync(path.join(this.folderPrefix, platform, 'sentry.properties')) ||
      fs.existsSync(
        path.join(process.cwd(), this.folderPrefix, platform, 'sentry.properties')
      )
    ) {
      return Promise.reject(
        `${platform}/sentry.properties already exists, skipping setup for platform ${
          platform
        }`
      );
    }
    return Promise.resolve();
  }

  private platformSelector() {
    return prompt([
      {
        choices: [
          {
            checked: true,
            name: 'iOS',
            value: 'ios',
          },
          {
            checked: true,
            name: 'Android',
            value: 'android',
          },
        ],
        message: 'Select the platforms you like to setup:',
        name: 'platform',
        type: 'checkbox',
      },
    ]);
  }
}
