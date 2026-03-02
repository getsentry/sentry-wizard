import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
import type {
  CodemodTransform,
  TransformContext,
  CodemodResult,
  ManualReviewItem,
} from '../../types.js';

const b = recast.types.builders;

const HUB_FUNCTIONS = ['getCurrentHub', 'getCurrentHubShim'];

// Methods that can be called directly on the Sentry namespace
const DIRECT_METHODS: Record<string, string> = {
  captureException: 'captureException',
  captureMessage: 'captureMessage',
  captureEvent: 'captureEvent',
  addBreadcrumb: 'addBreadcrumb',
  setUser: 'setUser',
  setTags: 'setTags',
  setTag: 'setTag',
  setExtra: 'setExtra',
  setExtras: 'setExtras',
  setContext: 'setContext',
};

// Methods that map to different top-level functions
const SCOPE_METHODS: Record<string, string> = {
  getScope: 'getCurrentScope',
  getClient: 'getClient',
  getIsolationScope: 'getIsolationScope',
};

function getLineNumber(node: t.Node): number {
  return node.loc?.start.line ?? 0;
}

export const hubRemoval: CodemodTransform = {
  name: 'hub-removal',
  description:
    'Removes getCurrentHub() and getCurrentHubShim() calls, replacing with direct API calls',

  transform(ctx: TransformContext): CodemodResult {
    let modified = false;
    const changes: string[] = [];
    const manualReviewItems: ManualReviewItem[] = [];

    // Track which hub function names are imported directly (not via namespace)
    const directHubImports = new Set<string>();
    // Track replacements needed for direct imports
    const importReplacements = new Map<string, Set<string>>();

    // First pass: find direct imports of getCurrentHub/getCurrentHubShim
    recast.visit(ctx.program, {
      visitImportDeclaration(path) {
        const specifiers = path.node.specifiers;
        if (!specifiers) {
          this.traverse(path);
          return;
        }
        for (const spec of specifiers) {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            HUB_FUNCTIONS.includes(spec.imported.name)
          ) {
            directHubImports.add(spec.imported.name);
          }
        }
        this.traverse(path);
      },
      visitVariableDeclarator(_path) {
        this.traverse(_path);
      },
    });

    // Second pass: transform hub method calls
    recast.visit(ctx.program, {
      visitExpressionStatement(path) {
        const expr = path.node.expression;
        if (expr.type !== 'CallExpression') {
          this.traverse(path);
          return;
        }

        const result = tryTransformHubCall(
          expr,
          ctx,
          directHubImports,
          importReplacements,
          manualReviewItems,
        );

        if (result) {
          path.node.expression = result;
          modified = true;
          changes.push('Replaced getCurrentHub() chain with direct call');
        }
        this.traverse(path);
      },

      visitVariableDeclarator(path) {
        const init = path.node.init;
        if (!init || init.type !== 'CallExpression') {
          this.traverse(path);
          return;
        }

        // Check for: const hub = getCurrentHub() or const hub = Sentry.getCurrentHub()
        if (isHubCreation(init, directHubImports)) {
          manualReviewItems.push({
            file: ctx.filePath,
            line: getLineNumber(path.node),
            description:
              'getCurrentHub() stored in variable. Replace usages manually: hub.captureException() → Sentry.captureException(), hub.getScope() → Sentry.getCurrentScope(), etc.',
          });
          this.traverse(path);
          return;
        }

        // Check for: const scope = Sentry.getCurrentHub().getScope()
        const result = tryTransformHubCall(
          init,
          ctx,
          directHubImports,
          importReplacements,
          manualReviewItems,
        );

        if (result) {
          path.node.init = result;
          modified = true;
          changes.push('Replaced getCurrentHub() chain with direct call');
        }
        this.traverse(path);
      },
    });

    // Third pass: update direct imports (replace getCurrentHub with the methods used)
    if (importReplacements.size > 0) {
      recast.visit(ctx.program, {
        visitImportDeclaration(path) {
          const specifiers = path.node.specifiers;
          if (!specifiers) {
            this.traverse(path);
            return;
          }

          const newSpecifiers: t.ImportSpecifier[] = [];
          let changed = false;

          for (const spec of specifiers) {
            if (
              spec.type === 'ImportSpecifier' &&
              spec.imported.type === 'Identifier' &&
              HUB_FUNCTIONS.includes(spec.imported.name)
            ) {
              // Replace this specifier with the actual methods used
              const replacements = importReplacements.get(spec.imported.name);
              if (replacements) {
                for (const methodName of replacements) {
                  newSpecifiers.push(
                    b.importSpecifier(b.identifier(methodName)),
                  );
                }
                changed = true;
              }
            } else if (spec.type === 'ImportSpecifier') {
              newSpecifiers.push(spec);
            }
          }

          if (changed) {
            path.node.specifiers = newSpecifiers;
            modified = true;
          }
          this.traverse(path);
        },
      });
    }

    return { modified, changes, manualReviewItems };
  },
};

function isHubCreation(
  node: t.CallExpression,
  directHubImports: Set<string>,
): boolean {
  // Direct call: getCurrentHub()
  if (
    node.callee.type === 'Identifier' &&
    directHubImports.has(node.callee.name)
  ) {
    return true;
  }
  // Namespace call: Sentry.getCurrentHub()
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    HUB_FUNCTIONS.includes(node.callee.property.name)
  ) {
    return true;
  }
  return false;
}

function tryTransformHubCall(
  callExpr: t.CallExpression,
  ctx: TransformContext,
  directHubImports: Set<string>,
  importReplacements: Map<string, Set<string>>,
  manualReviewItems: ManualReviewItem[],
): t.CallExpression | null {
  // Pattern: X.getCurrentHub().method(args) or getCurrentHub().method(args)
  // The outer call is method(args), its callee is a MemberExpression: X.getCurrentHub().method
  const callee = callExpr.callee;
  if (callee.type !== 'MemberExpression') {
    return null;
  }

  const methodProp = callee.property;
  if (methodProp.type !== 'Identifier') {
    return null;
  }

  const hubCall = callee.object;
  if (hubCall.type !== 'CallExpression') {
    return null;
  }

  // Check if it's getCurrentHub() or Sentry.getCurrentHub()
  let hubFnName: string | null = null;
  let namespace: t.Expression | null = null;

  if (
    hubCall.callee.type === 'Identifier' &&
    directHubImports.has(hubCall.callee.name)
  ) {
    hubFnName = hubCall.callee.name;
  } else if (
    hubCall.callee.type === 'MemberExpression' &&
    hubCall.callee.property.type === 'Identifier' &&
    HUB_FUNCTIONS.includes(hubCall.callee.property.name)
  ) {
    hubFnName = hubCall.callee.property.name;
    namespace = hubCall.callee.object as t.Expression;
  }

  if (!hubFnName) {
    return null;
  }

  const methodName = methodProp.name;
  let replacementName: string | null = null;

  if (methodName in DIRECT_METHODS) {
    replacementName = DIRECT_METHODS[methodName];
  } else if (methodName in SCOPE_METHODS) {
    replacementName = SCOPE_METHODS[methodName];
  }

  if (!replacementName) {
    manualReviewItems.push({
      file: ctx.filePath,
      line: getLineNumber(callExpr),
      description: `getCurrentHub().${methodName}() cannot be auto-migrated. See migration guide.`,
    });
    return null;
  }

  // Build the replacement call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let newCallee: any;
  if (namespace) {
    // Sentry.getCurrentHub().method() → Sentry.method()
    newCallee = b.memberExpression(
      namespace as t.Identifier,
      b.identifier(replacementName),
    );
  } else {
    // getCurrentHub().method() → method()
    newCallee = b.identifier(replacementName);
    // Track this for import rewriting
    const existing = importReplacements.get(hubFnName);
    if (existing) {
      existing.add(replacementName);
    } else {
      importReplacements.set(hubFnName, new Set([replacementName]));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return b.callExpression(newCallee, callExpr.arguments);
}
