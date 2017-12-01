import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { getPlatformChoices, IArgs } from '../../Constants';
import { patchMatchingFile } from '../../Helper/File';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { MobileProject } from './MobileProject';

export class Cordova extends MobileProject {
  protected sentryCli: SentryCli;
  protected folderPrefix = 'platforms';

  constructor(protected argv: IArgs) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers) {
    if (this.argv.uninstall) {
      return this.uninstall(answers);
    }

    const sentryCliProperties = this.sentryCli.convertAnswersToProperties(answers);

    return this.getPlatforms(answers).map(async (platform: string) => {
      try {
        await this.addSentryProperties(platform, sentryCliProperties);
        green(`Successfully set up ${platform} for cordova`);
      } catch (e) {
        red(e);
      }
    });
  }

  public async uninstall(answers: Answers) {
    return {};
  }

  protected async shouldConfigurePlatform(platform: string) {
    // if a sentry.properties file exists for the platform we want to configure
    // without asking the user.  This means that re-linking later will not
    // bring up a useless dialog.
    if (
      fs.existsSync(path.join(this.folderPrefix, platform, 'sentry.properties')) ||
      fs.existsSync(
        path.join(process.cwd(), this.folderPrefix, platform, 'sentry.properties')
      )
    ) {
      return false;
    }
    return true;
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
}
