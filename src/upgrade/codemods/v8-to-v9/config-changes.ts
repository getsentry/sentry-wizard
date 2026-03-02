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

// Config options to remove completely
const REMOVE_OPTIONS = ['hideSourceMaps', 'autoInstrumentRemix'];

// Config options that need manual review
const MANUAL_REVIEW_OPTIONS: Record<string, string> = {
  autoSessionTracking:
    "'autoSessionTracking' was removed in v9. Session tracking is now always enabled when a release is set. Remove this option and configure release tracking instead.",
};

function getLineNumber(node: t.Node): number {
  return node.loc?.start.line ?? 0;
}

export const configChanges: CodemodTransform = {
  name: 'config-changes',
  description:
    'Removes deprecated config options (enableTracing, hideSourceMaps, etc.) and flattens transactionContext',

  transform(ctx: TransformContext): CodemodResult {
    let modified = false;
    const changes: string[] = [];
    const manualReviewItems: ManualReviewItem[] = [];

    recast.visit(ctx.program, {
      visitObjectExpression(path) {
        const props = path.node.properties;

        // Process in reverse to safely splice
        for (let i = props.length - 1; i >= 0; i--) {
          const prop = props[i];
          if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') {
            continue;
          }

          const key = prop.key;
          let propName: string | null = null;
          if (key.type === 'Identifier') {
            propName = key.name;
          } else if (
            (key.type === 'StringLiteral' || key.type === 'Literal') &&
            typeof key.value === 'string'
          ) {
            propName = key.value;
          }

          if (!propName) {
            continue;
          }

          // enableTracing: true → tracesSampleRate: 1.0
          // enableTracing: false → remove
          if (propName === 'enableTracing') {
            const value = prop.value;
            const isTruthy =
              (value.type === 'BooleanLiteral' && value.value === true) ||
              (value.type === 'Literal' && value.value === true);

            if (isTruthy) {
              // Replace with tracesSampleRate: 1.0, with a TODO comment
              const newProp = b.objectProperty(
                b.identifier('tracesSampleRate'),
                b.numericLiteral(1.0),
              );
              newProp.comments = [
                b.commentLine(
                  " TODO(sentry-upgrade): 'enableTracing' was removed. Use tracesSampleRate instead.",
                  true,
                  false,
                ),
              ];
              props.splice(i, 1, newProp);
            } else {
              props.splice(i, 1);
            }

            modified = true;
            changes.push("Removed 'enableTracing' option");
            continue;
          }

          // Simple removals
          if (REMOVE_OPTIONS.includes(propName)) {
            props.splice(i, 1);
            modified = true;
            changes.push(`Removed '${propName}' option`);
            continue;
          }

          // Manual review options
          if (propName in MANUAL_REVIEW_OPTIONS) {
            manualReviewItems.push({
              file: ctx.filePath,
              line: getLineNumber(prop),
              description: MANUAL_REVIEW_OPTIONS[propName],
            });
            // Still remove the property
            props.splice(i, 1);
            modified = true;
            changes.push(`Removed '${propName}' (needs manual review)`);
            continue;
          }
        }

        this.traverse(path);
      },
    });

    // Flatten transactionContext access in tracesSampler
    recast.visit(ctx.program, {
      visitMemberExpression(path) {
        const node = path.node;

        // Look for: *.transactionContext.property
        if (
          node.property.type === 'Identifier' &&
          node.object.type === 'MemberExpression' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'transactionContext'
        ) {
          // Replace X.transactionContext.Y with X.Y
          const outerObject = node.object.object;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          path.replace(b.memberExpression(outerObject as any, node.property));
          modified = true;
          changes.push(
            `Flattened transactionContext.${node.property.name} access`,
          );
          return false;
        }

        this.traverse(path);
      },
    });

    return { modified, changes, manualReviewItems };
  },
};
