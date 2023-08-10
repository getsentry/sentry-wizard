import * as fs from 'fs';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import { manifest } from './templates';

export async function addManifestSnippet(manifestFile: string, dsn: string): Promise<boolean> {
    if (!fs.existsSync(manifestFile)) {
        clack.log.warn('AndroidManifest.xml not found.');
        Sentry.captureException('No AndroidManifest file');
        return false;
    }

    const manifestContent = fs.readFileSync(manifestFile, 'utf8');

    if (/android:name="io\.sentry\.dsn"/.test(manifestContent)) {
        // sentry is already configured
        clack.log.success('Sentry SDK is already configured.')
        return true;
    }

    const applicationMatch = /<\/application>/.exec(manifestContent);
    if (!applicationMatch) {
        clack.log.warn('<application> tag not found within the manifest.');
        Sentry.captureException('No <application> tag');
        return false;
    }

    const insertionIndex = applicationMatch.index;
    const newContent = manifestContent.slice(0, insertionIndex) +
        manifest(dsn) +
        manifestContent.slice(insertionIndex);
    fs.writeFileSync(manifestFile, newContent, 'utf8');
    
    clack.log.success(
      'Updated AndroidManifest with the Sentry SDK configuration.'
    );

    return true;
}