import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { IArgs } from '../../Constants';
import { patchMatchingFile } from '../../Helper/File';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseProject } from './BaseProject';

export class Cordova extends BaseProject {
  protected answers: Answers;
  protected platforms: string[];
  protected sentryCli: SentryCli;
  protected folderPrefix = 'platforms';

  constructor(protected argv: IArgs) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers) {
    if (this.argv.uninstall) {
      //   return this.uninstall();
    }

    const sentryCliProperties = this.sentryCli.convertSelectedProjectToProperties(
      answers
    );

    let platforms: string[] = ['ios', 'android'];

    if (this.argv.platform) {
      platforms = [this.argv.platform];
    }

    return platforms.map(async (platform: string) => {
      try {
        await this.addSentryProperties(platform, sentryCliProperties);
        green(`Successfully setup ${platform} for cordova`);
      } catch (e) {
        red(e);
      }
    });
  }

  public async uninstall() {
    return {};
  }

  public async shouldConfigure() {
    return {};
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

    rv = rv.then(() => fs.writeFileSync(fn, this.sentryCli.dumpProperties(properties)));

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
