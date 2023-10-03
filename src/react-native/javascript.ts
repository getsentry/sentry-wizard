import { makeCodeSnippet } from '../utils/clack-utils';

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
});`;
}
