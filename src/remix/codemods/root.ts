/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as recast from 'recast';
import * as path from 'path';

import type { ExportNamedDeclaration, Program } from '@babel/types';

import {
  builders,
  generateCode,
  loadFile,
  ProxifiedModule,
  writeFile,
  // @ts-expect-error - magicast is ESM and TS complains about that. It works though
} from 'magicast';

import {
  ERROR_BOUNDARY_TEMPLATE,
  META_FUNCTION_TEMPLATE,
  SENTRY_META_ENTRIES,
} from '../templates';
import { hasSentryContent } from '../utils';
import chalk from 'chalk';

// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

export function wrapAppWithSentry(
  rootRouteAst: ProxifiedModule,
  rootFileName: string,
) {
  rootRouteAst.imports.$add({
    from: '@sentry/remix',
    imported: 'withSentry',
    local: 'withSentry',
  });

  recast.visit(rootRouteAst.$ast, {
    visitExportDefaultDeclaration(path) {
      if (path.value.declaration.type === 'FunctionDeclaration') {
        // Move the function declaration just before the default export
        path.insertBefore(path.value.declaration);

        // Get the name of the function to be wrapped
        const functionName: string = path.value.declaration.id.name as string;

        // Create the wrapped function call
        const functionCall = recast.types.builders.callExpression(
          recast.types.builders.identifier('withSentry'),
          [recast.types.builders.identifier(functionName)],
        );

        // Replace the default export with the wrapped function call
        path.value.declaration = functionCall;
      } else if (path.value.declaration.type === 'Identifier') {
        const rootRouteExport = rootRouteAst.exports.default;

        const expressionToWrap = generateCode(rootRouteExport.$ast).code;

        rootRouteAst.exports.default = builders.raw(
          `withSentry(${expressionToWrap})`,
        );
      } else {
        clack.log.warn(
          chalk.yellow(
            `Couldn't instrument ${chalk.bold(
              rootFileName,
            )} automatically. Wrap your default export with: ${chalk.dim(
              'withSentry()',
            )}\n`,
          ),
        );
      }

      this.traverse(path);
    },
  });
}

export function isWithSentryAlreadyUsed(
  rootRouteAst: ProxifiedModule,
): boolean {
  // Check if withSentry is called anywhere in the code
  let isUsed = false;
  recast.visit(rootRouteAst.$ast, {
    visitCallExpression(path) {
      if (
        path.value.callee.type === 'Identifier' &&
        path.value.callee.name === 'withSentry'
      ) {
        isUsed = true;
        return false; // Stop traversal
      }
      this.traverse(path);
    },
  });
  return isUsed;
}

/**
 * Checks if the meta function already contains both sentry-trace AND baggage meta tags.
 * Both tags are required for complete trace propagation.
 * Returns true only if BOTH tags exist, false otherwise.
 */
export function hasSentryMetaTags(rootRouteAst: ProxifiedModule): boolean {
  let hasSentryTrace = false;
  let hasBaggage = false;

  recast.visit(rootRouteAst.$ast, {
    visitObjectExpression(path) {
      const props = path.value.properties;
      for (const prop of props) {
        // Check for { name: 'sentry-trace' } or { name: 'baggage' }
        if (
          prop.type === 'ObjectProperty' &&
          ((prop.key.type === 'Identifier' && prop.key.name === 'name') ||
            (prop.key.type === 'StringLiteral' && prop.key.value === 'name'))
        ) {
          const value = prop.value;
          const tagName =
            value.type === 'StringLiteral'
              ? value.value
              : value.type === 'Literal'
              ? value.value
              : null;

          if (tagName === 'sentry-trace') {
            hasSentryTrace = true;
          } else if (tagName === 'baggage') {
            hasBaggage = true;
          }

          // Early exit if both found
          if (hasSentryTrace && hasBaggage) {
            return false; // Stop traversal
          }
        }
      }
      this.traverse(path);
    },
  });

  // Only skip instrumentation if BOTH tags are present
  return hasSentryTrace && hasBaggage;
}

/**
 * Finds the meta export declaration in the AST
 */
export function findMetaExport(
  rootRouteAst: ProxifiedModule,
): ExportNamedDeclaration | null {
  const exportsAst = rootRouteAst.exports.$ast as Program;
  const namedExports = exportsAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  for (const namedExport of namedExports) {
    const declaration = namedExport.declaration;
    if (!declaration) continue;

    if (
      declaration.type === 'FunctionDeclaration' &&
      declaration.id?.name === 'meta'
    ) {
      return namedExport;
    }

    if (declaration.type === 'VariableDeclaration') {
      for (const decl of declaration.declarations) {
        // @ts-expect-error - id should have name property
        if (decl.id?.name === 'meta') {
          return namedExport;
        }
      }
    }
  }

  return null;
}

/**
 * Counts the number of return statements in a block
 */
function countReturnStatements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): number {
  let count = 0;
  recast.visit(body, {
    visitReturnStatement() {
      count++;
      return false; // Don't traverse into nested functions
    },
    visitFunctionDeclaration() {
      return false; // Skip nested functions
    },
    visitFunctionExpression() {
      return false; // Skip nested functions
    },
    visitArrowFunctionExpression() {
      return false; // Skip nested arrow functions
    },
  });
  return count;
}

/**
 * Gets the array expression from a meta function's return value
 * Returns null if the return value is not a simple array literal
 * or if there are multiple return statements (e.g., conditional returns)
 */
function getMetaReturnArrayExpression(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declaration: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  // Handle variable declaration with arrow function
  if (declaration.type === 'VariableDeclaration') {
    const init = declaration.declarations[0]?.init;
    if (!init) return null;

    // Arrow function with implicit return: () => [...]
    if (
      init.type === 'ArrowFunctionExpression' &&
      init.body.type === 'ArrayExpression'
    ) {
      return init.body;
    }

    // Arrow function with block body: () => { return [...] }
    if (
      init.type === 'ArrowFunctionExpression' &&
      init.body.type === 'BlockStatement'
    ) {
      // Check for multiple return statements
      if (countReturnStatements(init.body) > 1) {
        return null;
      }

      for (const stmt of init.body.body) {
        if (
          stmt.type === 'ReturnStatement' &&
          stmt.argument?.type === 'ArrayExpression'
        ) {
          return stmt.argument;
        }
      }
    }

    // Regular function expression: function() { return [...] }
    if (
      init.type === 'FunctionExpression' &&
      init.body.type === 'BlockStatement'
    ) {
      // Check for multiple return statements
      if (countReturnStatements(init.body) > 1) {
        return null;
      }

      for (const stmt of init.body.body) {
        if (
          stmt.type === 'ReturnStatement' &&
          stmt.argument?.type === 'ArrayExpression'
        ) {
          return stmt.argument;
        }
      }
    }
  }

  // Handle function declaration: function meta() { return [...] }
  if (
    declaration.type === 'FunctionDeclaration' &&
    declaration.body.type === 'BlockStatement'
  ) {
    // Check for multiple return statements
    if (countReturnStatements(declaration.body) > 1) {
      return null;
    }

    for (const stmt of declaration.body.body) {
      if (
        stmt.type === 'ReturnStatement' &&
        stmt.argument?.type === 'ArrayExpression'
      ) {
        return stmt.argument;
      }
    }
  }

  return null;
}

/**
 * Ensures the meta function parameter includes 'data' destructuring
 * Returns true if modification was successful or not needed
 */
function ensureDataParameter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declaration: any,
): boolean {
  let params: unknown[] | null = null;

  // Get the params array from the function
  if (declaration.type === 'VariableDeclaration') {
    const init = declaration.declarations[0]?.init;
    if (
      init?.type === 'ArrowFunctionExpression' ||
      init?.type === 'FunctionExpression'
    ) {
      params = init.params;
    }
  } else if (declaration.type === 'FunctionDeclaration') {
    params = declaration.params;
  }

  if (!params) return false;

  // If no params, add { data } parameter
  if (params.length === 0) {
    const dataParam = recast.types.builders.objectPattern([
      recast.types.builders.objectProperty.from({
        key: recast.types.builders.identifier('data'),
        value: recast.types.builders.identifier('data'),
        shorthand: true,
      }),
    ]);
    params.push(dataParam);
    return true;
  }

  // Check if first param is object pattern (destructuring)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstParam = params[0] as any;
  if (firstParam.type === 'ObjectPattern') {
    // Check if 'data' is already destructured with 'data' as the binding name
    // We need the actual binding to be 'data', not just the key
    // e.g., `{ data }` or `{ data: data }` - binding is 'data' ✓
    // e.g., `{ data: loaderData }` - binding is 'loaderData', not 'data' ✗
    /* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
    const hasDataBinding = firstParam.properties.some((prop: any) => {
      if (prop.type !== 'ObjectProperty') return false;
      // For shorthand { data }, the binding is 'data'
      if (prop.shorthand && prop.key.name === 'data') return true;
      // For non-shorthand { data: x }, check if value binding is 'data'
      if (
        prop.key.type === 'Identifier' &&
        prop.key.name === 'data' &&
        prop.value.type === 'Identifier' &&
        prop.value.name === 'data'
      ) {
        return true;
      }
      return false;
    });
    /* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

    if (!hasDataBinding) {
      // Add 'data' to the destructuring pattern
      firstParam.properties.unshift(
        recast.types.builders.objectProperty.from({
          key: recast.types.builders.identifier('data'),
          value: recast.types.builders.identifier('data'),
          shorthand: true,
        }),
      );
    }
    return true;
  }

  // If param is a simple identifier (e.g., `args`), we can't easily modify it
  // to add destructuring. Return false so the wizard warns the user instead
  // of injecting code that references undefined `data`.
  return false;
}

/**
 * Creates the sentry meta entry AST nodes
 */
function createSentryMetaEntries(): unknown[] {
  // Wrap entries in an array to make them parseable as expressions
  const arrayCode = `[${SENTRY_META_ENTRIES.join(', ')}]`;
  const parsed = recast.parse(arrayCode);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return parsed.program.body[0].expression.elements;
}

/**
 * Instruments the meta function to include sentry-trace and baggage meta tags
 * for server-to-client trace propagation
 */
export function instrumentMetaFunction(
  rootRouteAst: ProxifiedModule,
  rootFileName: string,
): boolean {
  // Check if sentry meta tags already exist
  if (hasSentryMetaTags(rootRouteAst)) {
    clack.log.info(
      `File ${chalk.cyan(
        path.basename(rootFileName),
      )} already contains sentry-trace meta tags. Skipping meta function instrumentation.`,
    );
    return false;
  }

  const metaExport = findMetaExport(rootRouteAst);

  if (!metaExport) {
    // No meta function exists - add a new one
    const metaFunctionAst = recast.parse(META_FUNCTION_TEMPLATE).program
      .body[0];

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(nodePath) {
        nodePath.insertBefore(
          recast.types.builders.exportDeclaration(false, metaFunctionAst),
        );
        this.traverse(nodePath);
      },
    });

    clack.log.success(
      `Added meta function with trace propagation tags to ${chalk.cyan(
        path.basename(rootFileName),
      )}.`,
    );
    return true;
  }

  // Meta function exists - try to modify it
  const declaration = metaExport.declaration;
  const arrayExpr = getMetaReturnArrayExpression(declaration);

  if (!arrayExpr) {
    // Complex meta function - warn user
    clack.log.warn(
      `Found a meta function in ${chalk.cyan(
        path.basename(rootFileName),
      )} but couldn't automatically add trace propagation tags.
Please add the following entries to your meta function's return array:

${chalk.dim(`{ name: 'sentry-trace', content: data?.sentryTrace },
{ name: 'baggage', content: data?.sentryBaggage },`)}

And ensure your meta function receives ${chalk.cyan(
        '{ data }',
      )} in its parameters.
See: https://docs.sentry.io/platforms/javascript/guides/remix/manual-setup/#server-side-data-fetching-and-tracing`,
    );
    return false;
  }

  // Ensure the function has 'data' parameter
  const hasDataParam = ensureDataParameter(declaration);
  if (!hasDataParam) {
    clack.log.warn(
      `Could not add 'data' parameter to meta function in ${chalk.cyan(
        path.basename(rootFileName),
      )}.
Please ensure your meta function receives ${chalk.cyan(
        '{ data }',
      )} parameter and add:

${chalk.dim(`{ name: 'sentry-trace', content: data?.sentryTrace },
{ name: 'baggage', content: data?.sentryBaggage },`)}

to your meta function's return array.`,
    );
    return false;
  }

  // Add sentry meta entries at the beginning of the array
  const sentryEntries = createSentryMetaEntries();
  arrayExpr.elements.unshift(...sentryEntries);

  clack.log.success(
    `Added trace propagation meta tags to existing meta function in ${chalk.cyan(
      path.basename(rootFileName),
    )}.`,
  );
  return true;
}

export async function instrumentRoot(rootFileName: string): Promise<void> {
  const rootRouteAst = await loadFile(
    path.join(process.cwd(), 'app', rootFileName),
  );

  const exportsAst = rootRouteAst.exports.$ast as Program;

  const namedExports = exportsAst.body.filter(
    (node) => node.type === 'ExportNamedDeclaration',
  ) as ExportNamedDeclaration[];

  let foundErrorBoundary = false;
  const withSentryAlreadyUsed = isWithSentryAlreadyUsed(rootRouteAst);

  namedExports.forEach((namedExport) => {
    const declaration = namedExport.declaration;

    if (!declaration) {
      return;
    }

    if (declaration.type === 'FunctionDeclaration') {
      if (declaration.id?.name === 'ErrorBoundary') {
        foundErrorBoundary = true;
      }
    } else if (declaration.type === 'VariableDeclaration') {
      const declarations = declaration.declarations;

      declarations.forEach((declaration) => {
        // @ts-expect-error - id should always have a name in this case
        if (declaration.id?.name === 'ErrorBoundary') {
          foundErrorBoundary = true;
        }
      });
    }
  });

  if (!foundErrorBoundary) {
    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'captureRemixErrorBoundaryError',
      local: 'captureRemixErrorBoundaryError',
    });

    rootRouteAst.imports.$add({
      from: '@remix-run/react',
      imported: 'useRouteError',
      local: 'useRouteError',
    });

    // Call wrapAppWithSentry if withSentry is not already used
    if (!withSentryAlreadyUsed) {
      wrapAppWithSentry(rootRouteAst, rootFileName);
    }

    recast.visit(rootRouteAst.$ast, {
      visitExportDefaultDeclaration(path) {
        const implementation = recast.parse(ERROR_BOUNDARY_TEMPLATE).program
          .body[0];

        path.insertBefore(
          recast.types.builders.exportDeclaration(false, implementation),
        );

        this.traverse(path);
      },
    });
    // If there is already a ErrorBoundary export, and it doesn't have Sentry content
  } else if (!hasSentryContent(rootFileName, rootRouteAst.$code)) {
    rootRouteAst.imports.$add({
      from: '@sentry/remix',
      imported: 'captureRemixErrorBoundaryError',
      local: 'captureRemixErrorBoundaryError',
    });

    // Call wrapAppWithSentry if withSentry is not already used
    if (!withSentryAlreadyUsed) {
      wrapAppWithSentry(rootRouteAst, rootFileName);
    }

    recast.visit(rootRouteAst.$ast, {
      visitExportNamedDeclaration(path) {
        // Find ErrorBoundary export
        if (path.value.declaration?.id?.name === 'ErrorBoundary') {
          const errorBoundaryExport = path.value.declaration;

          let errorIdentifier;

          // check if useRouteError is called
          recast.visit(errorBoundaryExport, {
            visitVariableDeclaration(path) {
              const variableDeclaration = path.value.declarations[0];
              const initializer = variableDeclaration.init;

              if (
                initializer.type === 'CallExpression' &&
                initializer.callee.name === 'useRouteError'
              ) {
                errorIdentifier = variableDeclaration.id.name;
              }

              this.traverse(path);
            },
          });

          // We don't have an errorIdentifier, which means useRouteError is not called / imported
          // We need to add it and capture the error
          if (!errorIdentifier) {
            rootRouteAst.imports.$add({
              from: '@remix-run/react',
              imported: 'useRouteError',
              local: 'useRouteError',
            });

            const useRouteErrorCall = recast.parse(
              `const error = useRouteError();`,
            ).program.body[0];

            // Insert at the top of ErrorBoundary body
            errorBoundaryExport.body.body.splice(0, 0, useRouteErrorCall);
          }

          const captureErrorCall = recast.parse(
            `captureRemixErrorBoundaryError(error);`,
          ).program.body[0];

          // Insert just before the the fallback page is returned
          errorBoundaryExport.body.body.splice(
            errorBoundaryExport.body.body.length - 1,
            0,
            captureErrorCall,
          );
        }
        this.traverse(path);
      },
    });
  } else if (!withSentryAlreadyUsed) {
    // Even if we have Sentry content but withSentry is not used, we should still wrap the app
    wrapAppWithSentry(rootRouteAst, rootFileName);
  }

  // Instrument meta function for server-to-client trace propagation
  instrumentMetaFunction(rootRouteAst, rootFileName);

  await writeFile(
    rootRouteAst.$ast,
    path.join(process.cwd(), 'app', rootFileName),
  );
}
