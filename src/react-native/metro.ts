// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { parseModule } from 'magicast';
import * as fs from 'fs';
import * as Sentry from '@sentry/node';

import { hasSentryContent } from '../utils/ast-utils';
import { abortIfCancelled, makeCodeSnippet, showCopyPasteInstructions } from '../utils/clack-utils';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

const b = recast.types.builders;

export async function patchMetroConfig() {
  const metroConfigPath = 'metro.config.js';
  const metroConfigContent = (
    await fs.promises.readFile(metroConfigPath)
  ).toString();

  const showInstructions = () => showCopyPasteInstructions(
    metroConfigPath,
    getMetroConfigSnippet(true),
    );

  const mod = parseModule(metroConfigContent);

  if (hasSentryContent(mod.$ast as t.Program)) {
    const shouldContinue = await confirmPathMetroConfig();
    if (!shouldContinue) {
      return;
    }
  }

  const configObj = getMetroConfigObject(mod.$ast as t.Program);
  if (!configObj) {
    await showInstructions();
    return;
  }

  const addedSentrySerializer = addSentrySerializerToMetroConfig(configObj);
  if (!addedSentrySerializer) {
    await showInstructions();
    return;
  }
  
  
}

export function unPatchMetroConfig() {
  // TODO: implement
}

export function addSentrySerializerToMetroConfig(configObj: t.ObjectExpression): boolean {
  const serializerProp = configObj.properties.find(
    (p: t.ObjectProperty) =>
      p.key.type === 'Identifier' && p.key.name === 'serializer',
  );

  // case 1: serializer property doesn't exist yet, so we can just add it
  if (!serializerProp) {
    configObj.properties.push(
      b.objectProperty(
        b.identifier('serializer'),
        b.objectExpression([
          b.objectProperty(
            b.identifier('customSerializer'),
            b.callExpression(
              b.identifier('createSentryMetroSerializer'),
              [],
            ),
          ),
        ]),
      ),
    );
    return true;
  }

  const isValidBuildProp =
    serializerProp.type === 'ObjectProperty' &&
    serializerProp.value.type === 'ObjectExpression';

  if (!isValidBuildProp) {
    return false;
  }

  const customSerializerProp =
    serializerProp.value.type === 'ObjectExpression' &&
    serializerProp.value.properties.find(
      (p: t.ObjectProperty) =>
        p.key.type === 'Identifier' && p.key.name === 'customSerializer',
    );

  // case 2: serializer.customSerializer property doesn't exist yet, so we just add it
  if (!customSerializerProp && serializerProp.value.type === 'ObjectExpression') {
    serializerProp.value.properties.push(
      b.objectProperty(
        b.identifier('customSerializer'),
        b.callExpression(
          b.identifier('createSentryMetroSerializer'),
          [],
        ),
      ),
    );
    return true;
  }

  return false;
}

export function addSentryserializerImportToMetroConfig(configObj: t.ObjectExpression): boolean {
  
}

async function confirmPathMetroConfig() {
  const shouldContinue = await abortIfCancelled(
    clack.select({
      message: `Metro Config already contains Sentry-related code. Should the wizard modify it anyway?`,
      options: [
        {
          label: 'Yes, add the Sentry Metro plugin',
          value: true,
        },
        {
          label: 'No, show me instructions to manually add the plugin',
          value: false,
        },
      ],
      initialValue: true,
    }),
  );

  if (!shouldContinue) {
    Sentry.setTag('ast-mod-fail-reason', 'has-sentry-content');
  }

  return shouldContinue;
}

/**
 * Returns value from `module.exports = value`
 */
function getMetroConfigObject(
  program: t.Program,
): t.ObjectExpression | undefined {
  const moduleExports = program.body.find(
    (s) => {
      if (s.type === 'ExpressionStatement' &&
          s.expression.type === 'AssignmentExpression' &&
          s.expression.left.type === 'MemberExpression' &&
          s.expression.left.object.type === 'Identifier' &&
          s.expression.left.object.name === 'module' &&
          s.expression.left.property.type === 'Identifier' &&
          s.expression.left.property.name === 'exports') {
        return true;
      }
      return false;
    },
  ) as t.ExpressionStatement | undefined;

  if ((moduleExports?.expression as t.AssignmentExpression).right.type === 'ObjectExpression') {
    return (moduleExports?.expression as t.AssignmentExpression).right as t.ObjectExpression;
  }

  // TODO: add another options like const config = {}
  return undefined;
}

function getMetroConfigSnippet(colors: boolean) {
  return makeCodeSnippet(colors, (unchanged, plus, _) =>
    unchanged(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');";
${plus("const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');")}

const config = {
  ${plus(`serializer: {
    customSerializer: createSentryMetroSerializer(),
  },`)}
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
`),
  );
}
