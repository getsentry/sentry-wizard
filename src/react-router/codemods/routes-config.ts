/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import * as recast from 'recast';
import * as fs from 'fs';
import type { namedTypes as t } from 'ast-types';

// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';

export async function addRoutesToConfig(
  routesConfigPath: string,
  isTS: boolean,
): Promise<void> {
  // Check if file exists first
  if (!fs.existsSync(routesConfigPath)) {
    return;
  }

  const routesAst = await loadFile(routesConfigPath);

  // Check if routes are already added
  const routesCode = routesAst.$code;
  if (
    routesCode.includes('sentry-example-page') &&
    routesCode.includes('sentry-example-api')
  ) {
    return;
  }

  // Add route import if not already present
  const hasRouteImport = routesAst.imports.$items.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) =>
      item.imported === 'route' && item.from === '@react-router/dev/routes',
  );

  if (!hasRouteImport) {
    routesAst.imports.$add({
      from: '@react-router/dev/routes',
      imported: 'route',
      local: 'route',
    });
  }

  // Set up the new routes
  const routeExtension = isTS ? 'tsx' : 'jsx';
  const apiExtension = isTS ? 'ts' : 'js';

  const pageRouteCode = `route("/sentry-example-page", "routes/sentry-example-page.${routeExtension}")`;
  const apiRouteCode = `route("/api/sentry-example-api", "routes/api.sentry-example-api.${apiExtension}")`;

  let foundDefaultExport = false;

  // Get the AST program
  const program = routesAst.$ast as t.Program;

  // Find the default export
  for (let i = 0; i < program.body.length; i++) {
    const node = program.body[i];

    if (node.type === 'ExportDefaultDeclaration') {
      foundDefaultExport = true;

      const declaration = node.declaration;

      let arrayExpression = null;

      if (declaration && declaration.type === 'ArrayExpression') {
        arrayExpression = declaration;
      } else if (declaration && declaration.type === 'TSSatisfiesExpression') {
        // Handle TypeScript satisfies expression like: [...] satisfies RouteConfig
        if (
          declaration.expression &&
          declaration.expression.type === 'ArrayExpression'
        ) {
          arrayExpression = declaration.expression;
        }
      }

      if (arrayExpression) {
        // Parse and add the new route calls directly to the elements array
        const pageRouteCall =
          recast.parse(pageRouteCode).program.body[0].expression;
        const apiRouteCall =
          recast.parse(apiRouteCode).program.body[0].expression;

        arrayExpression.elements.push(pageRouteCall);
        arrayExpression.elements.push(apiRouteCall);
      }
      break;
    }
  }

  // If no default export found, add one
  if (!foundDefaultExport) {
    // Create a simple array export without satisfies for now
    const newExportCode = `export default [
  ${pageRouteCode},
  ${apiRouteCode},
];`;

    const newExport = recast.parse(newExportCode).program.body[0];
    program.body.push(newExport);
  }

  await writeFile(routesAst.$ast, routesConfigPath);
}
