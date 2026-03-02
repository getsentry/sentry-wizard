import * as recast from 'recast';
import type {
  CodemodTransform,
  TransformContext,
  CodemodResult,
  ManualReviewItem,
} from '../../types.js';

// Import specifier renames: oldName → newName
const IMPORT_RENAMES: Record<string, string> = {
  WithSentry: 'SentryExceptionCaptured',
  SentryGlobalGenericFilter: 'SentryGlobalFilter',
  SentryGlobalGraphQLFilter: 'SentryGlobalFilter',
};

// Method renames on Sentry namespace: oldName → newName
const METHOD_RENAMES: Record<string, string> = {
  captureUserFeedback: 'captureFeedback',
};

// Methods that need manual review with a descriptive message
const MANUAL_REVIEW_METHODS: Record<string, string> = {
  addOpenTelemetryInstrumentation:
    "addOpenTelemetryInstrumentation() was removed. Pass instrumentations via the 'openTelemetryInstrumentations' option in Sentry.init() instead.",
};

// Import specifiers that need manual review
const MANUAL_REVIEW_IMPORTS: Record<string, string> = {
  wrapUseRoutes:
    'wrapUseRoutes was removed. Use wrapUseRoutesV6 or wrapUseRoutesV7 depending on your React Router version.',
  wrapCreateBrowserRouter:
    'wrapCreateBrowserRouter was removed. Use wrapCreateBrowserRouterV6 or wrapCreateBrowserRouterV7 depending on your React Router version.',
};

function getLineNumber(node: recast.types.namedTypes.Node): number {
  return node.loc?.start.line ?? 0;
}

export const methodRenames: CodemodTransform = {
  name: 'method-renames',
  description:
    'Renames removed/deprecated methods to their replacements (captureUserFeedback → captureFeedback, etc.)',

  transform(ctx: TransformContext): CodemodResult {
    let modified = false;
    const changes: string[] = [];
    const manualReviewItems: ManualReviewItem[] = [];

    // Pass 1: Rename import specifiers
    recast.visit(ctx.program, {
      visitImportSpecifier(path) {
        const imported = path.node.imported;
        if (imported.type !== 'Identifier') {
          this.traverse(path);
          return;
        }

        const name = imported.name;

        // Check for manual review imports
        if (name in MANUAL_REVIEW_IMPORTS) {
          manualReviewItems.push({
            file: ctx.filePath,
            line: getLineNumber(path.node),
            description: MANUAL_REVIEW_IMPORTS[name],
          });
          this.traverse(path);
          return;
        }

        // Check for direct renames
        if (name in IMPORT_RENAMES) {
          const newName = IMPORT_RENAMES[name];
          imported.name = newName;
          // Also rename local binding if it matches (no alias)
          if (
            path.node.local &&
            path.node.local.type === 'Identifier' &&
            path.node.local.name === name
          ) {
            path.node.local.name = newName;
          }
          modified = true;
          changes.push(`Renamed import '${name}' → '${newName}'`);
        }
        this.traverse(path);
      },
    });

    // Pass 2: Rename method calls and their arguments
    recast.visit(ctx.program, {
      visitCallExpression(path) {
        const node = path.node;
        const callee = node.callee;

        // Sentry.methodName() pattern
        if (callee.type === 'MemberExpression') {
          const prop = callee.property;
          if (prop.type !== 'Identifier') {
            this.traverse(path);
            return;
          }

          // Check for manual review methods
          if (prop.name in MANUAL_REVIEW_METHODS) {
            manualReviewItems.push({
              file: ctx.filePath,
              line: getLineNumber(node),
              description: MANUAL_REVIEW_METHODS[prop.name],
            });
            this.traverse(path);
            return;
          }

          // Check for method renames
          if (prop.name in METHOD_RENAMES) {
            const oldName = prop.name;
            const newName = METHOD_RENAMES[oldName];
            prop.name = newName;
            modified = true;
            changes.push(`Renamed method '${oldName}' → '${newName}'`);

            // Special handling: captureUserFeedback → captureFeedback
            // also rename 'comments' field to 'message'
            if (oldName === 'captureUserFeedback') {
              renameFeedbackComments(node, changes);
            }
          }
        }

        // Also handle renamed identifiers used as decorators or direct calls
        // e.g. if they imported WithSentry and use it as WithSentry()
        if (callee.type === 'Identifier' && callee.name in IMPORT_RENAMES) {
          const oldName = callee.name;
          callee.name = IMPORT_RENAMES[oldName];
          modified = true;
          changes.push(
            `Renamed call '${oldName}' → '${IMPORT_RENAMES[oldName]}'`,
          );
        }

        this.traverse(path);
      },

      // Handle decorator usage: @WithSentry() → @SentryExceptionCaptured()
      visitDecorator(path) {
        const expr = path.node.expression;
        if (
          expr.type === 'CallExpression' &&
          expr.callee.type === 'Identifier'
        ) {
          if (expr.callee.name in IMPORT_RENAMES) {
            const oldName = expr.callee.name;
            expr.callee.name = IMPORT_RENAMES[oldName];
            modified = true;
            changes.push(
              `Renamed decorator '@${oldName}' → '@${IMPORT_RENAMES[oldName]}'`,
            );
          }
        }
        this.traverse(path);
      },
    });

    return { modified, changes, manualReviewItems };
  },
};

function renameFeedbackComments(
  callExpr: recast.types.namedTypes.CallExpression,
  changes: string[],
): void {
  // Look for the first object argument and rename 'comments' to 'message'
  for (const arg of callExpr.arguments) {
    if (arg.type !== 'ObjectExpression') {
      continue;
    }

    for (const prop of arg.properties) {
      if (
        (prop.type === 'ObjectProperty' || prop.type === 'Property') &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'comments'
      ) {
        prop.key.name = 'message';
        changes.push("Renamed field 'comments' → 'message' in feedback object");
      }
    }
  }
}
