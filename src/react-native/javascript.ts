/* eslint-disable max-lines */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as Sentry from '@sentry/node';

import { traceStep } from '../telemetry';
import { makeCodeSnippet, showCopyPasteInstructions } from '../utils/clack';
import { getFirstMatchedPath } from './glob';
import { RN_SDK_PACKAGE } from './react-native-wizard';
import { preserveTrailingNewline } from '../utils/ast-utils';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, ProxifiedModule, parseModule } from 'magicast';
import * as t from '@babel/types';

export const sessionReplaySampleRate = 0.1;
export const sessionReplayOnErrorSampleRate = 1.0;

export async function addSentryInit({
  dsn,
  enableSessionReplay = false,
  enableFeedbackWidget = false,
  enableLogs = false,
}: {
  dsn: string;
  enableSessionReplay?: boolean;
  enableFeedbackWidget?: boolean;
  enableLogs?: boolean;
}) {
  const jsPath = getMainAppFilePath();
  Sentry.setTag('app-js-file-status', jsPath ? 'found' : 'not-found');
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file. Place the following code snippet close to the Apps Root component.`,
    );
    Sentry.captureException('Could not find main App file.');
    await showCopyPasteInstructions({
      filename: 'App.js or _layout.tsx',
      codeSnippet: getSentryInitColoredCodeSnippet(
        dsn,
        enableSessionReplay,
        enableFeedbackWidget,
        enableLogs,
      ),
      hint: 'This ensures the Sentry SDK is ready to capture errors.',
    });
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
    const newContent = addSentryInitWithSdkImport(js, {
      dsn,
      enableSessionReplay,
      enableFeedbackWidget,
      enableLogs,
    });

    try {
      fs.writeFileSync(jsPath, newContent, 'utf-8');
      clack.log.success(
        `Added ${chalk.cyan('Sentry.init')} to ${chalk.cyan(jsRelativePath)}.`,
      );
    } catch (error) {
      clack.log.error(`Error while writing ${jsPath}`);
      Sentry.captureException('Error while writing app.js');
    }
  });

  Sentry.setTag('app-js-file-status', 'added-sentry-init');
  clack.log.success(
    chalk.green(`${chalk.cyan(jsRelativePath)} changes saved.`),
  );
}

export function addSentryInitWithSdkImport(
  js: string,
  {
    dsn,
    enableSessionReplay = false,
    enableFeedbackWidget = false,
    enableLogs = false,
  }: {
    dsn: string;
    enableSessionReplay?: boolean;
    enableFeedbackWidget?: boolean;
    enableLogs?: boolean;
  },
): string {
  return js.replace(
    /^([^]*)(import\s+[^;]*?;$)/m,
    (match: string) => `${match}
${getSentryInitPlainTextSnippet(
  dsn,
  enableSessionReplay,
  enableFeedbackWidget,
  enableLogs,
)}`,
  );
}

export function doesJsCodeIncludeSdkSentryImport(
  js: string,
  { sdkPackageName }: { sdkPackageName: string },
): boolean {
  return !!js.match(sdkPackageName);
}

export function getSentryInitColoredCodeSnippet(
  dsn: string,
  enableSessionReplay = false,
  enableFeedbackWidget = false,
  enableLogs = false,
) {
  return makeCodeSnippet(true, (_unchanged, plus, _minus) => {
    return plus(
      getSentryInitPlainTextSnippet(
        dsn,
        enableSessionReplay,
        enableFeedbackWidget,
        enableLogs,
      ),
    );
  });
}

export function getSentryInitPlainTextSnippet(
  dsn: string,
  enableSessionReplay = false,
  enableFeedbackWidget = false,
  enableLogs = false,
) {
  return `import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: '${dsn}',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: ${enableLogs ? 'true' : 'false'},
${
  enableSessionReplay
    ? `
  // Configure Session Replay
  replaysSessionSampleRate: ${sessionReplaySampleRate},
  replaysOnErrorSampleRate: ${sessionReplayOnErrorSampleRate},
`
    : ''
}${getSentryIntegrationsPlainTextSnippet(
    enableSessionReplay,
    enableFeedbackWidget,
  )}
  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});`;
}

export function getSentryIntegrationsPlainTextSnippet(
  enableSessionReplay = false,
  enableFeedbackWidget = false,
) {
  if (!enableSessionReplay && !enableFeedbackWidget) {
    return '';
  }
  return `  integrations: [${
    enableSessionReplay ? 'Sentry.mobileReplayIntegration()' : ''
  }${enableSessionReplay && enableFeedbackWidget ? ', ' : ''}${
    enableFeedbackWidget ? 'Sentry.feedbackIntegration()' : ''
  }],
`;
}

function getMainAppFilePath(): string | undefined {
  const prefixGlob = '{.,./src,./app}';
  const suffixGlob = '@(j|t|cj|mj)s?(x)';
  const universalGlob = `@(App|_layout).${suffixGlob}`;
  const jsFileGlob = `${prefixGlob}/+(${universalGlob})`;
  const jsPath = traceStep('find-app-js-file', () =>
    getFirstMatchedPath(jsFileGlob),
  );
  return jsPath;
}

/**
 * This step should be executed after `addSentryInit`
 */
export async function wrapRootComponent() {
  const showInstructions = () =>
    showCopyPasteInstructions({
      filename: 'App.js or _layout.tsx',
      codeSnippet: getSentryWrapColoredCodeSnippet(),
    });

  const jsPath = getMainAppFilePath();
  Sentry.setTag('app-js-file-status', jsPath ? 'found' : 'not-found');
  if (!jsPath) {
    clack.log.warn(
      `Could not find main App file. Please wrap your App's Root component.`,
    );
    await showInstructions();
    return;
  }

  const jsRelativePath = path.relative(process.cwd(), jsPath);

  const js = fs.readFileSync(jsPath, 'utf-8');

  const mod = parseModule(js);
  const result = checkAndWrapRootComponent(mod);

  if (result === SentryWrapResult.AlreadyWrapped) {
    Sentry.setTag('app-js-file-status', 'already-includes-sentry-wrap');
    clack.log.warn(
      `${chalk.cyan(
        jsRelativePath,
      )} already includes Sentry.wrap. We wont't add it again.`,
    );
    return;
  }

  if (result === SentryWrapResult.NotFound) {
    clack.log.warn(
      `Could not find your App's Root component. Please wrap your App's Root component manually.`,
    );
    await showInstructions();
    return;
  }

  traceStep('add-sentry-wrap', () => {
    try {
      const code = preserveTrailingNewline(js, generateCode(mod.$ast).code);
      fs.writeFileSync(jsPath, code, 'utf-8');
      clack.log.success(
        `Added ${chalk.cyan('Sentry.wrap')} to ${chalk.cyan(jsRelativePath)}.`,
      );
    } catch (error) {
      clack.log.error(`Error while writing ${jsPath}`);
      Sentry.captureException('Error while writing app.js');
      return;
    }
  });

  Sentry.setTag('app-js-file-status', 'added-sentry-wrap');
  clack.log.success(
    chalk.green(`${chalk.cyan(jsRelativePath)} changes saved.`),
  );
}

export enum SentryWrapResult {
  NotFound = 'RootComponentNotFound',
  AlreadyWrapped = 'AlreadyWrapped',
  Success = 'Success',
}

export function checkAndWrapRootComponent(
  mod: ProxifiedModule,
): SentryWrapResult {
  if (doesContainSentryWrap(mod.$ast as t.Program)) {
    return SentryWrapResult.AlreadyWrapped;
  }

  const defaultExport = getDefaultExport(mod.$ast as t.Program);
  if (!defaultExport) {
    return SentryWrapResult.NotFound;
  }

  const wrappedConfig = wrapWithSentry(defaultExport);

  const replacedDefaultExport = replaceDefaultExport(
    mod.$ast as t.Program,
    wrappedConfig,
  );

  if (!replacedDefaultExport) {
    return SentryWrapResult.NotFound;
  }

  return SentryWrapResult.Success;
}

export function getDefaultExport(
  program: t.Program,
):
  | t.Identifier
  | t.CallExpression
  | t.ObjectExpression
  | t.FunctionDeclaration
  | t.ArrowFunctionExpression
  | t.ClassDeclaration
  | undefined {
  for (const node of program.body) {
    if (
      t.isExportDefaultDeclaration(node) &&
      (t.isIdentifier(node.declaration) ||
        t.isCallExpression(node.declaration) ||
        t.isObjectExpression(node.declaration) ||
        t.isFunctionDeclaration(node.declaration) ||
        t.isArrowFunctionExpression(node.declaration) ||
        t.isClassDeclaration(node.declaration))
    ) {
      Sentry.setTag('app-js-file-status', 'default-export');
      return node.declaration;
    }
  }

  Sentry.setTag('app-js-file-status', 'default-export-not-found');
  return undefined;
}

export function wrapWithSentry(
  configObj:
    | t.Identifier
    | t.CallExpression
    | t.ObjectExpression
    | t.FunctionDeclaration
    | t.ArrowFunctionExpression
    | t.ClassDeclaration,
): t.CallExpression {
  if (t.isFunctionDeclaration(configObj)) {
    return t.callExpression(
      t.memberExpression(t.identifier('Sentry'), t.identifier('wrap')),
      [
        t.functionExpression(
          configObj.id,
          configObj.params,
          configObj.body,
          configObj.generator,
          configObj.async,
        ),
      ],
    );
  }

  if (t.isArrowFunctionExpression(configObj)) {
    return t.callExpression(
      t.memberExpression(t.identifier('Sentry'), t.identifier('wrap')),
      [configObj],
    );
  }

  if (t.isClassDeclaration(configObj)) {
    return t.callExpression(
      t.memberExpression(t.identifier('Sentry'), t.identifier('wrap')),
      [
        t.classExpression(
          configObj.id,
          configObj.superClass,
          configObj.body,
          configObj.decorators,
        ),
      ],
    );
  }

  return t.callExpression(
    t.memberExpression(t.identifier('Sentry'), t.identifier('wrap')),
    [configObj],
  );
}

export function replaceDefaultExport(
  program: t.Program,
  wrappedDefaultExport: t.CallExpression,
): boolean {
  for (const node of program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      node.declaration = wrappedDefaultExport;
      return true;
    }
  }
  return false;
}

export function doesContainSentryWrap(program: t.Program): boolean {
  for (const node of program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      const declaration = node.declaration;
      if (t.isCallExpression(declaration)) {
        const callExpr = declaration;
        if (t.isMemberExpression(callExpr.callee)) {
          const callee = callExpr.callee;
          if (
            t.isIdentifier(callee.object) &&
            callee.object.name === 'Sentry' &&
            t.isIdentifier(callee.property) &&
            callee.property.name === 'wrap'
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function getSentryWrapColoredCodeSnippet() {
  return makeCodeSnippet(true, (_unchanged, plus, _minus) => {
    return plus(`import * as Sentry from '@sentry/react-native';

export default Sentry.wrap(App);`);
  });
}
