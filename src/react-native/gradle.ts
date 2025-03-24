import * as fs from 'fs';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

const applyFrom = `apply from: new File(["node", "--print", "require.resolve('@sentry/react-native/package.json')"].execute().text.trim(), "../sentry.gradle")`;

export function doesAppBuildGradleIncludeRNSentryGradlePlugin(
  content: string,
): boolean {
  return content.includes('sentry.gradle');
}

export function addRNSentryGradlePlugin(content: string): string {
  return content.replace(/^android {/m, (match) => `${applyFrom}\n${match}`);
}

export function removeRNSentryGradlePlugin(content: string): string {
  return content.replace(/^\s*apply from:.*sentry\.gradle.*;?\s*?\r?\n/m, '');
}

export function writeAppBuildGradle(path: string, newContent: string): void {
  try {
    const currentContent = fs.readFileSync(path, 'utf-8');
    if (newContent === currentContent) {
      clack.log.info(`No changes to ${path}.`);
      return;
    }

    fs.writeFileSync(path, newContent, 'utf-8');
  } catch (error) {
    clack.log.error(`Error while writing ${path}`);
  }
}
