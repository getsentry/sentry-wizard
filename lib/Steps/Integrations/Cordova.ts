import * as fs from 'fs';
import { Answers, prompt } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { Args, getPlatformChoices } from '../../Constants';
import { exists, matchesContent, patchMatchingFile } from '../../Helper/File';
import { dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { MobileProject } from './MobileProject';

const xcode = require('xcode');

export class Cordova extends MobileProject {
  protected sentryCli: SentryCli;
  protected folderPrefix = 'platforms';
  protected pluginFolder = ['plugins', 'sentry-cordova'];
  // We need this whenever scoped packages are supported
  // https://issues.apache.org/jira/browse/CB-10239?jql=labels%20%3D%20cordova-8.0.0
  // protected pluginFolder = ['plugins', '@sentry', 'cordova'];

  constructor(protected argv: Args) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    if (this.argv.uninstall) {
      return this.uninstall(answers);
    }

    const sentryCliProperties = this.sentryCli.convertAnswersToProperties(answers);

    return new Promise(async (resolve, reject) => {
      const promises = this.getPlatforms(answers).map(async (platform: string) => {
        try {
          if (platform === 'ios') {
            await patchMatchingFile(
              `${this.folderPrefix}/ios/*.xcodeproj/project.pbxproj`,
              this.patchXcodeProj.bind(this)
            );
          }
          await this.addSentryProperties(platform, sentryCliProperties);
          green(`Successfully set up ${platform} for cordova`);
        } catch (e) {
          red(e);
        }
      });
      Promise.all(promises)
        .then(resolve)
        .catch(reject);
    });
  }

  public async uninstall(answers: Answers): Promise<Answers> {
    await patchMatchingFile(
      '**/*.xcodeproj/project.pbxproj',
      this.unpatchXcodeProj.bind(this)
    );

    return {};
  }

  protected async shouldConfigurePlatform(platform: string): Promise<boolean> {
    let result = false;
    if (!exists(path.join(...this.pluginFolder, 'sentry.properties'))) {
      result = true;
      this.debug(`${this.pluginFolder}/sentry.properties not exists`);
    }

    if (platform === 'ios') {
      if (!matchesContent('**/*.xcodeproj/project.pbxproj', /SENTRY_PROPERTIES/gi)) {
        result = true;
        this.debug('**/*.xcodeproj/project.pbxproj not matched');
      }
    }

    if (this.argv.uninstall) {
      // if we uninstall we need to invert the result so we remove already patched
      // but leave untouched platforms as they are
      return !result;
    }

    return result;
  }

  private unpatchXcodeProj(contents: string, filename: string): Promise<string> {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.unpatchXcodeBuildScripts(proj);
        resolve(proj.writeSync());
      });
    });
  }

  private unpatchXcodeBuildScripts(proj: any): void {
    const scripts = proj.hash.project.objects.PBXShellScriptBuildPhase || {};
    const firstTarget = proj.getFirstTarget().uuid;
    const nativeTargets = proj.hash.project.objects.PBXNativeTarget;

    // scripts to kill entirely.
    for (const key of Object.keys(scripts)) {
      const script = scripts[key];

      // ignore comments and keys that got deleted
      if (typeof script === 'string' || script === undefined) {
        continue;
      }

      if (script.shellScript.match(/SENTRY_PROPERTIES/)) {
        delete scripts[key];
        delete scripts[key + '_comment'];
        const phases = nativeTargets[firstTarget].buildPhases;
        if (phases) {
          for (let i = 0; i < phases.length; i++) {
            if (phases[i].value === key) {
              phases.splice(i, 1);
              break;
            }
          }
        }
        continue;
      }
    }
  }

  private patchXcodeProj(contents: string, filename: string): Promise<void | string> {
    const proj = xcode.project(filename);
    return new Promise((resolve, reject) => {
      proj.parse((err: any) => {
        if (err) {
          reject(err);
          return;
        }

        const buildScripts = [];
        for (const key in proj.hash.project.objects.PBXShellScriptBuildPhase || {}) {
          if (proj.hash.project.objects.PBXShellScriptBuildPhase.hasOwnProperty(key)) {
            const val = proj.hash.project.objects.PBXShellScriptBuildPhase[key];
            if (val.isa) {
              buildScripts.push(val);
            }
          }
        }

        this.addNewXcodeBuildPhaseForSymbols(buildScripts, proj);

        // we always modify the xcode file in memory but we only want to save it
        // in case the user wants configuration for ios.  This is why we check
        // here first if changes are made before we might prompt the platform
        // continue prompt.
        const newContents = proj.writeSync();
        if (newContents === contents) {
          resolve();
        } else {
          resolve(newContents);
        }
      });
    });
  }

  private addNewXcodeBuildPhaseForSymbols(buildScripts: any, proj: any): void {
    for (const script of buildScripts) {
      if (script.shellScript.match(/SENTRY_PROPERTIES/)) {
        return;
      }
    }

    proj.addBuildPhase(
      [],
      'PBXShellScriptBuildPhase',
      'Upload Debug Symbols to Sentry',
      null,
      {
        shellPath: '/bin/sh',
        shellScript:
          'export SENTRY_PROPERTIES=sentry.properties\\n' +
          'function getProperty {\\n' +
          '    PROP_KEY=$1\\n' +
          '    PROP_VALUE=`cat $SENTRY_PROPERTIES | grep "$PROP_KEY" | cut -d\'=\' -f2`\\n' +
          '    echo $PROP_VALUE\\n' +
          '}\\n' +
          'echo "# Reading property from $SENTRY_PROPERTIES"\\n' +
          'SENTRY_CLI=$(getProperty "cli.executable")\\n' +
          'SENTRY_COMMAND="../../$SENTRY_CLI upload-dsym"\\n' +
          '$SENTRY_COMMAND',
      }
    );
  }

  private addSentryProperties(platform: string, properties: any): Promise<void> {
    let rv = Promise.resolve();
    // This will create the ios/android folder before trying to write
    // sentry.properties in it which would fail otherwise

    let allFolders = '';
    this.pluginFolder.map(folderPath => {
      allFolders = path.join(allFolders, folderPath);
      if (!fs.existsSync(allFolders)) {
        dim(`intermediate ${allFolders} folder did not exist, creating it.`);
        fs.mkdirSync(allFolders);
      }
    });

    const fn = path.join(allFolders, 'sentry.properties');

    rv = rv.then(() => fs.writeFileSync(fn, this.sentryCli.dumpProperties(properties)));

    return rv;
  }
}
