import * as fs from 'fs';

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
  const currentContent = fs.readFileSync(path, 'utf-8');
  if (newContent === currentContent) {
    return;
  }

  fs.writeFileSync(path, newContent, 'utf-8');
}
