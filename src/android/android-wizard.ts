/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'fs';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as path from 'path';
import { abort, confirmContinueEvenThoughNoGitRepo, getOrAskForProjectData, printWelcome } from "../utils/clack-utils";
import { WizardOptions } from "../utils/types";
const gradle2js = require('gradle-to-js');

export async function runAndroidWizard(
    options: WizardOptions,
): Promise<void> {
    printWelcome({
        wizardName: 'Sentry Android Wizard',
        promoCode: options.promoCode,   
    });

    await confirmContinueEvenThoughNoGitRepo();

    const projectDir = '../sentry-java'
    const buildGradleFiles = findFilesWithExtensions(projectDir, ['.gradle', 'gradle.kts']);

    if (!buildGradleFiles || buildGradleFiles.length === 0) {
        clack.log.error(
          'No Gradle project found. Please run this command from the root of your project.',
        );
        await abort();
        return;
      }

    const apps = [];
    for (let index = 0; index < buildGradleFiles.length; index++) {
        const file = buildGradleFiles[index];
        const text = fs.readFileSync(file, 'utf8');
        const test = gradle2js.parseFile(file);
        if(/^com\.android\.application$/im.test(text)) {
           apps.push(file); 
        }
    }

    console.log('');
    const { selectedProject, authToken, selfHosted, sentryUrl } =
        await getOrAskForProjectData(options, 'android');
}

//find files with the given extension
function findFilesWithExtensions(dir: string, extensions: string[], filesWithExtensions: string[] = []): string[] {
    const files = fs.readdirSync(dir, { withFileTypes: true});
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (file.isDirectory()) {
            const childDir = path.join(dir, file.name);
            findFilesWithExtensions(childDir, extensions, filesWithExtensions);
        } else if (extensions.some(ext => file.name.endsWith(ext))) {
            if (process.cwd() === dir) {
                filesWithExtensions.push(file.name);
            } else {
                const filePath = path.join(dir, file.name);
                filesWithExtensions.push(filePath);
            }
        }
    }
    return filesWithExtensions
  }
