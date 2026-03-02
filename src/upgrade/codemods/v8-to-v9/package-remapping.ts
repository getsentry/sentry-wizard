import * as recast from 'recast';
import type {
  CodemodTransform,
  TransformContext,
  CodemodResult,
} from '../../types.js';

const PACKAGE_REMAP: Record<string, string> = {
  '@sentry/utils': '@sentry/core',
  '@sentry/types': '@sentry/core',
};

export const packageRemapping: CodemodTransform = {
  name: 'package-remapping',
  description:
    'Remaps removed packages (@sentry/utils, @sentry/types) to @sentry/core',

  transform(ctx: TransformContext): CodemodResult {
    let modified = false;
    const changes: string[] = [];

    recast.visit(ctx.program, {
      // ESM: import ... from '@sentry/utils'
      visitImportDeclaration(path) {
        const source = path.node.source;
        if (source.type === 'StringLiteral' && source.value in PACKAGE_REMAP) {
          const oldPkg = source.value;
          const newPkg = PACKAGE_REMAP[oldPkg];
          source.value = newPkg;
          modified = true;
          changes.push(`Remapped import '${oldPkg}' → '${newPkg}'`);
        }
        this.traverse(path);
      },

      // CJS: require('@sentry/utils')
      visitCallExpression(path) {
        const node = path.node;
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1
        ) {
          const arg = node.arguments[0];
          if (arg.type === 'StringLiteral' && arg.value in PACKAGE_REMAP) {
            const oldPkg = arg.value;
            const newPkg = PACKAGE_REMAP[oldPkg];
            arg.value = newPkg;
            modified = true;
            changes.push(
              `Remapped require('${oldPkg}') → require('${newPkg}')`,
            );
          }
        }
        this.traverse(path);
      },
    });

    return { modified, changes, manualReviewItems: [] };
  },
};
