/* eslint-disable max-lines */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as Sentry from '@sentry/node';

import { traceStep } from '../telemetry';
import {
  makeCodeSnippet,
  showCopyPasteInstructions,
} from '../utils/clack-utils';
import { getFirstMatchedPath } from './glob';
import { RN_SDK_PACKAGE } from './react-native-wizard';

export async function addSentryInit({ dsn }: { dsn: string }) {
  const jsPath = getMainAppFilePath('find-app-js-file');
  Sentry.setTag('app-js-file-status', jsPath ? 'found' : 'not-found');
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file. Place the following code snippet close to the Apps Root component.`,
    );
    await showCopyPasteInstructions(
      'App.js or _layout.tsx',
      getSentryInitColoredCodeSnippet(dsn),
      'This ensures the Sentry SDK is ready to capture errors.',
    );
    return;
  }
  const jsRelativePath = path.relative(process.cwd(), jsPath);

  const js = fs.readFileSync(jsPath, 'utf-8');
  const includesSentry = doesJsCodeIncludeSdkSentryImport(js, {
    sdkPackageName: RN_SDK_PACKAGE,
  });
  if (includesSentry) {
    Sentry.setTag('app-js-file-status', 'already-includes-sentry');
    clack.log.warn(
      `${chalk.cyan(
        jsRelativePath,
      )} already includes Sentry. We wont't add it again.`,
    );
    return;
  }

  traceStep('add-sentry-init', () => {
    const newContent = addSentryInitWithSdkImport(js, { dsn });

    clack.log.success(
      `Added ${chalk.cyan('Sentry.init')} to ${chalk.cyan(jsRelativePath)}.`,
    );

    fs.writeFileSync(jsPath, newContent, 'utf-8');
  });

  Sentry.setTag('app-js-file-status', 'added-sentry-init');
  clack.log.success(
    chalk.green(`${chalk.cyan(jsRelativePath)} changes saved.`),
  );
}

export function addSentryInitWithSdkImport(
  js: string,
  { dsn }: { dsn: string },
): string {
  return js.replace(
    /^([^]*)(import\s+[^;]*?;$)/m,
    (match: string) => `${match}
${getSentryInitPlainTextSnippet(dsn)}`,
  );
}

export function doesJsCodeIncludeSdkSentryImport(
  js: string,
  { sdkPackageName }: { sdkPackageName: string },
): boolean {
  return !!js.match(sdkPackageName);
}

export function getSentryInitColoredCodeSnippet(dsn: string) {
  return makeCodeSnippet(true, (_unchanged, plus, _minus) => {
    return plus(getSentryInitPlainTextSnippet(dsn));
  });
}

export function getSentryInitPlainTextSnippet(dsn: string) {
  return `import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: '${dsn}',

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});`;
}

function getMainAppFilePath(stepToTrace: string): string | undefined {
  const prefixGlob = '{.,./src,./app}';
  const suffixGlob = '@(j|t|cj|mj)s?(x)';
  const universalGlob = `@(App|_layout).${suffixGlob}`;
  const jsFileGlob = `${prefixGlob}/+(${universalGlob})`;
  const jsPath = traceStep(stepToTrace, () =>
    getFirstMatchedPath(jsFileGlob),
  );
  return jsPath;
}

/**
 * This step should be executed after `addSentryInit`
 */
export async function wrapRootComponent() {
  const jsPath = getMainAppFilePath('find-app-js-file-to-wrap');
  Sentry.setTag('app-js-file-status-to-wrap', jsPath ? 'found' : 'not-found');
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file. Please wrap your App's Root component.`,
    );
    await showCopyPasteInstructions(
      'App.js or _layout.tsx',
      getSentryWrapColoredCodeSnippet(),
    );
    return;
  }

  const jsRelativePath = path.relative(process.cwd(), jsPath);

  const js = fs.readFileSync(jsPath, 'utf-8');

  if (doesContainSentryWrap(js)) {
    Sentry.setTag('app-js-file-status', 'already-includes-sentry-wrap');
    clack.log.warn(
      `${chalk.cyan(
        jsRelativePath,
      )} already includes Sentry.wrap. We wont't add it again.`,
    );
    return;
  }

  const includesSentry = doesJsCodeIncludeSdkSentryImport(js, {
    sdkPackageName: RN_SDK_PACKAGE,
  });
  if (!includesSentry) {
    clack.log.warn(
      `Please import '@sentry/react-native' and wrap your App's Root component manually.`,
    );
    await showCopyPasteInstructions(
      'App.js or _layout.tsx',
      getSentryWrapColoredCodeSnippet(),
    );
    return;
  }

  if (!foundRootComponent(js)) {
    clack.log.warn(
      `Could not find your App's Root component. Please wrap your App's Root component manually.`,
    );
    await showCopyPasteInstructions(
      'App.js or _layout.tsx',
      getSentryWrapColoredCodeSnippet(),
    );
    return;
  }

  traceStep('add-sentry-wrap', () => {
    const newContent = addSentryWrap(js);

    clack.log.success(
      `Added ${chalk.cyan('Sentry.wrap')} to ${chalk.cyan(jsRelativePath)}.`,
    );

    fs.writeFileSync(jsPath, newContent, 'utf-8');
  });

  Sentry.setTag('app-js-file-status', 'added-sentry-wrap');
  clack.log.success(
    chalk.green(`${chalk.cyan(jsRelativePath)} changes saved.`),
  );
}

export function doesContainSentryWrap(js: string): boolean {
  return js.includes('Sentry.wrap');
}

export function foundRootComponent(js: string): boolean {
  return /export default (\w+);/.test(js);
}

export function addSentryWrap(js: string): string {
  return js.replace(/export default (\w+);/, 'export default Sentry.wrap($1);');
}

export function getSentryWrapColoredCodeSnippet() {
  return makeCodeSnippet(true, (_unchanged, plus, _minus) => {
    return plus(`import * as Sentry from '@sentry/react-native';

      export default Sentry.wrap(App);`);
  });
}
