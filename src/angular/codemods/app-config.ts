/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import type { ArrayExpression, Identifier, ObjectProperty } from '@babel/types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule } from 'magicast';
import { gte, type SemVer } from 'semver';
import * as recast from 'recast';

export function updateAppConfigMod(
  originalAppConfigMod: ProxifiedModule<any>,
  angularVersion: SemVer,
  isTracingEnabled: boolean,
): ProxifiedModule<any> {
  const isAboveAngularV19 = gte(angularVersion, '19.0.0');

  addImports(originalAppConfigMod, isAboveAngularV19, isTracingEnabled);
  addProviders(originalAppConfigMod, isAboveAngularV19, isTracingEnabled);

  return originalAppConfigMod;
}

function addSentryImport(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;
  const hasSentryImport = imports.$items.some(
    (item) =>
      item.from === '@sentry/angular' &&
      item.imported === '*' &&
      item.local === 'Sentry',
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
  originalAppConfigMod: ProxifiedModule<any>,
): void {
  const imports = originalAppConfigMod.imports;
  const hasErrorHandler = imports.$items.some(
    (item) => item.local === 'ErrorHandler',
  );

  if (!hasErrorHandler) {
    imports.$add({
      from: '@angular/core',
      imported: 'ErrorHandler',
      local: 'ErrorHandler',
    });
  }
}

function addRouterImport(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;
  const hasRouter = imports.$items.some((item) => item.local === 'Router');

  if (!hasRouter) {
    imports.$add({
      from: '@angular/router',
      imported: 'Router',
      local: 'Router',
    });
  }
}

function addMissingImportsV19(
  originalAppConfigMod: ProxifiedModule<any>,
): void {
  const imports = originalAppConfigMod.imports;

  const hasProvideAppInitializer = imports.$items.some(
    (item) => item.local === 'provideAppInitializer',
  );

  if (!hasProvideAppInitializer) {
    imports.$add({
      from: '@angular/core',
      imported: 'provideAppInitializer',
      local: 'provideAppInitializer',
    });
  }

  const hasInject = imports.$items.some((item) => item.local === 'inject');

  if (!hasInject) {
    imports.$add({
      from: '@angular/core',
      imported: 'inject',
      local: 'inject',
    });
  }
}

function addAppInitializer(originalAppConfigMod: ProxifiedModule<any>): void {
  const imports = originalAppConfigMod.imports;

  const hasAppInitializer = imports.$items.some(
    (item) => item.local === 'APP_INITIALIZER',
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
  originalAppConfigMod: ProxifiedModule<any>,
  isAboveAngularV19: boolean,
  isTracingEnabled: boolean,
): void {
  addSentryImport(originalAppConfigMod);
  addErrorHandlerImport(originalAppConfigMod);
  addRouterImport(originalAppConfigMod);

  if (isAboveAngularV19) {
    addMissingImportsV19(originalAppConfigMod);
  } else if (isTracingEnabled) {
    addAppInitializer(originalAppConfigMod);
  }
}

function addProviders(
  originalAppConfigMod: ProxifiedModule<any>,
  isAboveAngularV19: boolean,
  isTracingEnabled: boolean,
): void {
  const b = recast.types.builders;

  recast.visit(originalAppConfigMod.exports.$ast, {
    visitExportNamedDeclaration(path) {
      // @ts-expect-error - declaration should always be present in this case
      if (path.node.declaration.declarations[0].id.name === 'appConfig') {
        const appConfigProps =
          // @ts-expect-error - declaration should always be present in this case
          path.node.declaration.declarations[0].init.properties;

        const providers = appConfigProps.find(
          (prop: ObjectProperty) =>
            (prop.key as Identifier).name === 'providers',
        ).value as ArrayExpression;

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

        providers.elements.push(
          // @ts-expect-error - errorHandlerObject is an objectExpression
          errorHandlerObject,
        );

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

          // @ts-expect-error - traceServiceObject is an objectExpression
          providers.elements.push(traceServiceObject);

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
            providers.elements.push(provideAppInitializerCall);
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
            providers.elements.push(provideAppInitializerObject);
          }
        }
      }

      this.traverse(path);
    },
  });
}
