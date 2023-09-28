import * as fs from 'fs';

const applyFrom = 'apply from: "../../node_modules/@sentry/react-native/sentry.gradle"';

export function doesAppBuildGradleIncludeSentry(content: string) {
  return content.includes(applyFrom);
}

export function patchAppBuildGradle(content: string): string {
  return content.replace(
    /^android {/m,
    match => `${applyFrom}\n${match}`,
  );
}

export function writeAppBuildGradle(path: string, newContent: string) {
  const currentContent = fs.readFileSync(path, 'utf-8');
  if (newContent === currentContent) {
    return;
  }

  fs.writeFileSync(
    path,
    newContent,
    'utf-8',
  );
}
