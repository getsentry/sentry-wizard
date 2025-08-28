import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import chalk from 'chalk';
import * as Sentry from '@sentry/node';
import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

//@ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { makeCodeSnippet, showCopyPasteInstructions } from '../../utils/clack';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule, ProxifiedModule } from 'magicast';
import { debug } from '../../utils/debug';

const SVELTE_CONFIG_FILE = 'svelte.config.js';

const b = recast.types.builders;

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

      const { error, result } =
        _enableTracingAndInstrumentationInConfig(svelteConfigContent);

      if (error) {
        clack.log.warning(
          'Failed to automatically enable SvelteKit tracing and instrumentation.',
        );
        debug(error);
        Sentry.captureException(error);
        await showFallbackConfigSnippet();
        return;
      }

      if (result) {
        await fs.promises.writeFile(configPath, result);
      }

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

export function _enableTracingAndInstrumentationInConfig(config: string): {
  result?: string;
  error?: string;
} {
  let svelteConfig: ProxifiedModule<t.Program>;
  try {
    svelteConfig = parseModule(config);
  } catch (e) {
    return {
      error: 'Failed to parse Svelte config',
    };
  }

  let configObject: t.ObjectExpression | undefined = undefined;

  // Cases to handle for finding the config object:
  // 1. default export is named object
  // 2. default export is in-place object
  // 2. default export is an identifier, so look up the variable declaration
  recast.visit(svelteConfig.$ast, {
    visitExportDefaultDeclaration(path) {
      const exportDeclarationNode = path.node;
      if (
        exportDeclarationNode.declaration.type === 'AssignmentExpression' &&
        exportDeclarationNode.declaration.right.type === 'ObjectExpression'
      ) {
        configObject = exportDeclarationNode.declaration.right;
        return false;
      }

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

  if (!_isValidConfigObject(configObject)) {
    return {
      error: "Couldn't find the config object",
    };
  }

  // This type cast is safe. For some reason, TS still assumes that `configObject`
  // is `undefined` so we have to tell it that it's not (see check above)
  const validatedConfigObject =
    configObject as recast.types.namedTypes.ObjectExpression;

  const kitProp = validatedConfigObject.properties.find(
    (prop) =>
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'kit',
  );

  if (!kitProp || kitProp.type !== 'ObjectProperty') {
    return {
      error: "Couldn't find the `kit` property",
    };
  }

  if (kitProp.value.type !== 'ObjectExpression') {
    return {
      error: `\`kit\` property has unexpected type: ${kitProp.value.type}`,
    };
  }

  // 1. find or add `kit.experimental` property
  // type-cast because TS can't infer the type in `.find` :(
  const kitExperimentalProp = kitProp.value.properties.find(
    (prop) =>
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'experimental',
  ) as t.ObjectProperty | undefined;

  let experimentalObject: t.ObjectExpression;

  if (kitExperimentalProp) {
    if (kitExperimentalProp.value.type !== 'ObjectExpression') {
      return {
        error: `Property \`kit.experimental\` has unexpected type: ${kitExperimentalProp.value.type}`,
      };
    }

    experimentalObject = kitExperimentalProp.value;
  } else {
    experimentalObject = b.objectExpression([]);
    kitProp.value.properties.push(
      b.objectProperty(b.identifier('experimental'), experimentalObject),
    );
  }

  // 2. find or add `kit.experimental.tracing` property
  //    find or add `kit.experimental.instrumentation` property
  const kitExperimentalTraingProp = experimentalObject.properties.find(
    (prop) =>
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'tracing',
  ) as t.ObjectProperty | undefined;

  const kitExperimentalInstrumentationProp = experimentalObject.properties.find(
    (prop) =>
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'instrumentation',
  ) as t.ObjectProperty | undefined;

  let experimentalTracingObject: t.ObjectExpression;
  let experimentalInstrumentationObject: t.ObjectExpression;

  if (kitExperimentalTraingProp) {
    if (kitExperimentalTraingProp.value.type !== 'ObjectExpression') {
      return {
        error: `Property \`kit.experimental.tracing\` has unexpected type: ${kitExperimentalTraingProp.value.type}`,
      };
    }

    experimentalTracingObject = kitExperimentalTraingProp.value;
  } else {
    experimentalTracingObject = b.objectExpression([]);
    experimentalObject.properties.push(
      b.objectProperty(b.identifier('tracing'), experimentalTracingObject),
    );
  }

  if (kitExperimentalInstrumentationProp) {
    if (kitExperimentalInstrumentationProp.value.type !== 'ObjectExpression') {
      return {
        error: `Property \`kit.experimental.instrumentation\` has unexpected type: ${kitExperimentalInstrumentationProp.value.type}`,
      };
    }

    experimentalInstrumentationObject =
      kitExperimentalInstrumentationProp.value;
  } else {
    experimentalInstrumentationObject = b.objectExpression([]);
    experimentalObject.properties.push(
      b.objectProperty(
        b.identifier('instrumentation'),
        experimentalInstrumentationObject,
      ),
    );
  }

  // 3. find or add `kit.experimental.tracing.server` property
  //    find or add `kit.experimental.instrumentation.server` property
  const kitExperimentalTracingSeverProp =
    experimentalTracingObject.properties.find(
      (prop) =>
        prop.type === 'ObjectProperty' &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'server',
    ) as t.ObjectProperty | undefined;

  const kitExperimentalInstrumentationSeverProp =
    experimentalInstrumentationObject.properties.find(
      (prop) =>
        prop.type === 'ObjectProperty' &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'server',
    ) as t.ObjectProperty | undefined;

  if (kitExperimentalTracingSeverProp) {
    if (kitExperimentalTracingSeverProp.value.type !== 'BooleanLiteral') {
      return {
        error: `Property \`kit.experimental.tracing.server\` has unexpected type: ${kitExperimentalTracingSeverProp.value.type}`,
      };
    }

    kitExperimentalTracingSeverProp.value = b.booleanLiteral(true);
  } else {
    experimentalTracingObject.properties.push(
      b.objectProperty(b.identifier('server'), b.booleanLiteral(true)),
    );
  }

  if (kitExperimentalInstrumentationSeverProp) {
    if (
      kitExperimentalInstrumentationSeverProp.value.type !== 'BooleanLiteral'
    ) {
      return {
        error: `Property \`kit.experimental.instrumentation.server\` has unexpected type: ${kitExperimentalInstrumentationSeverProp.value.type}`,
      };
    }
    kitExperimentalInstrumentationSeverProp.value = b.booleanLiteral(true);
  } else {
    experimentalInstrumentationObject.properties.push(
      b.objectProperty(b.identifier('server'), b.booleanLiteral(true)),
    );
  }

  try {
    return {
      result: generateCode(svelteConfig).code,
    };
  } catch (e) {
    debug(e);
    return {
      error: 'Failed to generate code for Svelte config',
    };
  }
}

function _isValidConfigObject(
  o: t.ObjectExpression | undefined,
): o is t.ObjectExpression {
  return !!o && o.type === 'ObjectExpression';
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
