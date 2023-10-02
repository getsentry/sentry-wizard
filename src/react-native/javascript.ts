export function addSentryInitWithSdkImport(
  js: string,
  { dsn }: { dsn: string },
): string {
  return js.replace(
    /^([^]*)(import\s+[^;]*?;$)/m,
    (match: string) => `${match}
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: '${dsn}',
});
`,
  );
}

export function doesJsCodeIncludeSdkSentryImport(
  js: string,
  { sdkPackageName }: { sdkPackageName: string },
): boolean {
  return !!js.match(sdkPackageName);
}
