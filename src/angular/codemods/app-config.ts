import type { ObjectProperty } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { gte, type SemVer } from 'semver';
import * as recast from 'recast';
import chalk from 'chalk';

export function updateAppConfigMod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppConfigMod: ProxifiedModule<any>,
  angularVersion: SemVer,
  isTracingEnabled: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ProxifiedModule<any> {
  const isAboveAngularV19 = gte(angularVersion, '19.0.0');

  addImports(originalAppConfigMod, isAboveAngularV19, isTracingEnabled);
  addProviders(originalAppConfigMod, isAboveAngularV19, isTracingEnabled);

  return originalAppConfigMod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addSentryImport(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;
  const hasSentryImport = imports.$items.some(
    (item) => item.from === '@sentry/angular',
  );

  if (!hasSentryImport) {
    imports.$add({
      from: '@sentry/angular',
      imported: '*',
      local: 'Sentry',
    });
  }
}

function addErrorHandlerImport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppConfigMod: ProxifiedModule<any>,
): void {
  const imports = originalAppConfigMod.imports;
  const hasErrorHandler = imports.$items.some(
    (item) => item.local === 'ErrorHandler' && item.from === '@angular/core',
  );

  if (!hasErrorHandler) {
    imports.$add({
      from: '@angular/core',
      imported: 'ErrorHandler',
      local: 'ErrorHandler',
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addRouterImport(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;
  const hasRouter = imports.$items.some(
    (item) => item.local === 'Router' && item.from === '@angular/router',
  );

  if (!hasRouter) {
    imports.$add({
      from: '@angular/router',
      imported: 'Router',
      local: 'Router',
    });
  }
}

function addMissingImportsV19(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppConfigMod: ProxifiedModule<any>,
): void {
  const imports = originalAppConfigMod.imports;

  const hasProvideAppInitializer = imports.$items.some(
    (item) =>
      item.local === 'provideAppInitializer' && item.from === '@angular/core',
  );

  if (!hasProvideAppInitializer) {
    imports.$add({
      from: '@angular/core',
      imported: 'provideAppInitializer',
      local: 'provideAppInitializer',
    });
  }

  const hasInject = imports.$items.some(
    (item) => item.local === 'inject' && item.from === '@angular/core',
  );

  if (!hasInject) {
    imports.$add({
      from: '@angular/core',
      imported: 'inject',
      local: 'inject',
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addAppInitializer(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;

  const hasAppInitializer = imports.$items.some(
    (item) => item.local === 'APP_INITIALIZER' && item.from === '@angular/core',
  );

  if (!hasAppInitializer) {
    imports.$add({
      from: '@angular/core',
      imported: 'APP_INITIALIZER',
      local: 'APP_INITIALIZER',
    });
  }
}

function addImports(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppConfigMod: ProxifiedModule<any>,
  isAboveAngularV19: boolean,
  isTracingEnabled: boolean,
): void {
  addSentryImport(originalAppConfigMod);
  addErrorHandlerImport(originalAppConfigMod);

  if (isTracingEnabled) {
    addRouterImport(originalAppConfigMod);
  }

  if (isAboveAngularV19) {
    addMissingImportsV19(originalAppConfigMod);
  } else if (isTracingEnabled) {
    addAppInitializer(originalAppConfigMod);
  }
}

function addProviders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalAppConfigMod: ProxifiedModule<any>,
  isAboveAngularV19: boolean,
  isTracingEnabled: boolean,
): void {
  const b = recast.types.builders;

  recast.visit(originalAppConfigMod.exports.$ast, {
    visitExportNamedDeclaration(path) {
      if (
        path.node.declaration?.type !== 'VariableDeclaration' ||
        path.node.declaration.declarations[0]?.type !== 'VariableDeclarator' ||
        path.node.declaration.declarations[0].id.type !== 'Identifier' ||
        path.node.declaration.declarations[0].id.name !== 'appConfig' ||
        path.node.declaration.declarations[0].init?.type !==
          'ObjectExpression' ||
        !path.node.declaration.declarations[0].init.properties
      ) {
        return;
      }

      const appConfigProps =
        path.node.declaration.declarations[0].init.properties;

      const providersProperty = appConfigProps.find(
        (prop) =>
          prop?.type === 'ObjectProperty' &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'providers',
        // type cast is safe because we already check the type in the find condition
      ) as ObjectProperty | undefined;

      const validProviders =
        providersProperty?.value?.type === 'ArrayExpression'
          ? providersProperty.value
          : undefined;

      if (!validProviders) {
        return;
      }

      // Check if there is already an ErrorHandler provider
      const hasErrorHandlerProvider = validProviders?.elements.some(
        (element) =>
          element &&
          element.type === 'ObjectExpression' &&
          element.properties.some(
            (prop) =>
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'provide' &&
              prop.value.type === 'Identifier' &&
              prop.value.name === 'ErrorHandler',
          ),
      );

      // If there is already an ErrorHandler provider, we skip adding it and log a message
      if (hasErrorHandlerProvider) {
        clack.log.warn(`ErrorHandler provider already exists in your app config.
Please refer to the Sentry Angular SDK documentation to combine it manually with Sentry's ErrorHandler.
${chalk.underline(
  'https://docs.sentry.io/platforms/javascript/guides/angular/features/error-handler/',
)}
`);
      } else {
        const errorHandlerObject = b.objectExpression([
          b.objectProperty(
            b.identifier('provide'),
            b.identifier('ErrorHandler'),
          ),
          b.objectProperty(
            b.identifier('useValue'),
            b.identifier('Sentry.createErrorHandler()'),
          ),
        ]);

        validProviders.elements.push(
          // @ts-expect-error - errorHandlerObject is an objectExpression
          errorHandlerObject,
        );
      }

      if (isTracingEnabled) {
        const traceServiceObject = b.objectExpression([
          b.objectProperty(
            b.identifier('provide'),
            b.identifier('Sentry.TraceService'),
          ),
          b.objectProperty(
            b.identifier('deps'),
            b.arrayExpression([b.identifier('Router')]),
          ),
        ]);

        // @ts-expect-error - errorHandlerObject is an objectExpression
        validProviders.elements.push(traceServiceObject);

        if (isAboveAngularV19) {
          const provideAppInitializerCall = b.callExpression(
            b.identifier('provideAppInitializer'),
            [
              b.arrowFunctionExpression(
                [],
                b.blockStatement([
                  b.expressionStatement(
                    b.callExpression(b.identifier('inject'), [
                      b.identifier('Sentry.TraceService'),
                    ]),
                  ),
                ]),
              ),
            ],
          );

          // @ts-expect-error - provideAppInitializerCall is an objectExpression
          validProviders.elements.push(provideAppInitializerCall);
        } else {
          const provideAppInitializerObject = b.objectExpression([
            b.objectProperty(
              b.identifier('provide'),
              b.identifier('APP_INITIALIZER'),
            ),
            b.objectProperty(
              b.identifier('useFactory'),
              b.arrowFunctionExpression(
                [],
                b.arrowFunctionExpression([], b.blockStatement([])),
              ),
            ),
            b.objectProperty(
              b.identifier('deps'),
              b.arrayExpression([b.identifier('Sentry.TraceService')]),
            ),
            b.objectProperty(b.identifier('multi'), b.booleanLiteral(true)),
          ]);

          // @ts-expect-error - provideAppInitializerObject is an objectExpression
          validProviders.elements.push(provideAppInitializerObject);
        }
      }

      this.traverse(path);
    },
  });
}
