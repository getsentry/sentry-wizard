import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';
import * as recast from 'recast';

//@ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { makeCodeSnippet, showCopyPasteInstructions } from '../../utils/clack';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
import { debug } from '../../utils/debug';

const SVELTE_CONFIG_FILE = 'svelte.config.js';

export type PartialBackwardsForwardsCompatibleSvelteConfig = {
  kit?: {
    files?: {
      hooks?: {
        client?: string;
        server?: string;
      };
      routes?: string;
    };
    experimental?: {
      tracing?: {
        server?: boolean;
      };
      instrumentation?: {
        server?: boolean;
      };
    };
  };
};

export async function loadSvelteConfig(): Promise<PartialBackwardsForwardsCompatibleSvelteConfig> {
  const configFilePath = path.join(process.cwd(), SVELTE_CONFIG_FILE);

  try {
    if (!fs.existsSync(configFilePath)) {
      return {};
    }

    const configUrl = url.pathToFileURL(configFilePath).href;
    const svelteConfigModule = (await import(configUrl)) as {
      default: PartialBackwardsForwardsCompatibleSvelteConfig;
    };

    return svelteConfigModule?.default || {};
  } catch (e: unknown) {
    clack.log.error(`Couldn't load ${chalk.cyan(SVELTE_CONFIG_FILE)}.
Are you running this wizard from the root of your SvelteKit project?`);
    clack.log.info(
      chalk.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );

    return {};
  }
}

export async function enableTracingAndInstrumentation(
  originalSvelteConfig: PartialBackwardsForwardsCompatibleSvelteConfig,
) {
  const hasTracingEnabled = originalSvelteConfig.kit?.experimental?.tracing;
  const hasInstrumentationEnabled =
    originalSvelteConfig.kit?.experimental?.instrumentation;

  if (hasTracingEnabled && hasInstrumentationEnabled) {
    clack.log.info('Tracing and instrumentation are already enabled.');
    return;
  }

  if (hasTracingEnabled || hasInstrumentationEnabled) {
    clack.log.info(
      'Tracing and instrumentation are partially enabled. Make sure both options are enabled.',
    );
    await showFallbackConfigSnippet();
    return;
  } else {
    try {
      const configPath = path.join(process.cwd(), SVELTE_CONFIG_FILE);
      const svelteConfigContent = await fs.promises.readFile(
        configPath,
        'utf-8',
      );

      const modifiedConfig =
        _enableTracingAndInstrumentationInConfig(svelteConfigContent);

      await fs.promises.writeFile(configPath, modifiedConfig);

      clack.log.success(
        `Enabled tracing and instrumentation in ${chalk.cyan(
          SVELTE_CONFIG_FILE,
        )}`,
      );
    } catch (e) {
      clack.log.error(
        `Failed to enable tracing and instrumentation in ${chalk.cyan(
          SVELTE_CONFIG_FILE,
        )}.`,
      );
      debug(e);
      Sentry.captureException(
        `Failed to enable tracing and instrumentation in ${SVELTE_CONFIG_FILE}`,
      );
      await showFallbackConfigSnippet();
      return;
    }
  }
}

export function _enableTracingAndInstrumentationInConfig(
  config: string,
): string | false {
  const svelteConfig = parseModule(config);
  const b = recast.types.builders;

  let configObject: recast.types.namedTypes.ObjectExpression | undefined =
    undefined;

  // 2 cases to handle for finding the config object:
  // 1. default export is the object directly
  // 2. default export is an identifier, so look up the variable declaration
  recast.visit(svelteConfig.$ast, {
    visitExportDefaultDeclaration(path) {
      const exportDeclarationNode = path.node;
      if (exportDeclarationNode.declaration.type === 'ObjectExpression') {
        configObject = exportDeclarationNode.declaration;
        return false;
      }

      if (exportDeclarationNode.declaration.type === 'Identifier') {
        const identifierName = exportDeclarationNode.declaration.name;
        recast.visit(svelteConfig.$ast, {
          visitVariableDeclarator(path) {
            if (
              path.node.id?.type === 'Identifier' &&
              path.node.id.name === identifierName &&
              path.node.init?.type === 'ObjectExpression'
            ) {
              configObject = path.node.init;
              return false;
            }

            this.traverse(path);
          },
        });
      }

      this.traverse(path);
    },
  });

  if (!configObject) {
    return false;
  }

  // Find the kit property
  const kitProperty = configObject.properties.find(
    (prop) =>
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'kit',
  );

  if (
    kitProperty &&
    kitProperty.type === 'ObjectProperty' &&
    kitProperty.value.type === 'ObjectExpression'
  ) {
    // Check if experimental property already exists
    const experimentalProperty = kitProperty.value.properties.find(
      (prop) =>
        prop.type === 'ObjectProperty' &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'experimental',
    );

    if (!experimentalProperty) {
      // Create the experimental object with tracing and instrumentation
      const tracingObject = b.objectExpression([
        b.objectProperty(b.identifier('server'), b.booleanLiteral(true)),
      ]);

      const instrumentationObject = b.objectExpression([
        b.objectProperty(b.identifier('server'), b.booleanLiteral(true)),
      ]);

      const experimentalObject = b.objectExpression([
        b.objectProperty(b.identifier('tracing'), tracingObject),
        b.objectProperty(
          b.identifier('instrumentation'),
          instrumentationObject,
        ),
      ]);

      // Add the experimental property to the kit object
      kitProperty.value.properties.push(
        b.objectProperty(b.identifier('experimental'), experimentalObject),
      );
    }
  }

  const generatedCode = generateCode(svelteConfig).code;

  // Post-process to remove extra newlines that recast adds
  return generatedCode
    .replace(
      /adapter: adapter\(\),\n\n {4}experimental:/g,
      'adapter: adapter(),\n    experimental:',
    )
    .replace(
      /server: true,\n {6}\},\n\n {6}instrumentation:/g,
      'server: true,\n      },\n      instrumentation:',
    );
}

async function showFallbackConfigSnippet(): Promise<void> {
  const codeSnippet = makeCodeSnippet(true, (unchanged, plus) =>
    unchanged(`const config = {
preprocess: vitePreprocess(),

kit: {
  adapter: adapter(),
  ${plus(`experimental: {
    instrumentation: {
      server: true,
    },
    tracing: {
      server: true,
    },
  },`)}
},
};
`),
  );

  await showCopyPasteInstructions({
    filename: 'svelte.config.js',
    codeSnippet,
  });
}
