// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, type ProxifiedModule, parseModule } from 'magicast';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

import {
  addSentrySerializerRequireToMetroConfig,
  addSentrySerializer,
  getMetroConfigObject,
  removeSentryRequire,
  removeSentrySerializerFromMetroConfig,
  addMergeConfigRequire,
} from '../../src/react-native/metro';

describe('patch metro config - sentry serializer', () => {
  describe('expo', () => {
    it('add to Expo default config', () => {
      const mod =
        parseModule(`// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
`);
      const config = getConfigVariable(mod, 1);
      const addedSerializer = addSentrySerializer(config);
      const addedImport = addSentrySerializerRequireToMetroConfig(
        mod.$ast as t.Program,
      );
      const addedMergeConfigImport = addMergeConfigRequire(
        'const mocked = code(not-containing-merge-config);',
        mod.$ast as t.Program,
        {},
      );
      expect(addedSerializer).toBe(true);
      expect(addedImport).toBe(true);
      expect(addedMergeConfigImport).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const {
  createSentryMetroSerializer
} = require("@sentry/react-native/dist/js/tools/sentryMetroSerializer");

const {
  mergeConfig
} = require("metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = mergeConfig(getDefaultConfig(__dirname), {
  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
});

module.exports = config;`);
    });
  });

  describe('addSentrySerializerUsingMergeConfig', () => {
    it('merge exports identifier', () => {
      const mod = parseModule(`module.exports = config`);
      const config = getModuleExportsObject(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = mergeConfig(config, {
  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
})`);
    });

    it('merge var identifier', () => {
      const mod = parseModule(`const config = myConfig`);
      const config = getConfigVariable(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`const config = mergeConfig(myConfig, {
  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
})`);
    });

    it('merge exports function call', () => {
      const mod = parseModule(`module.exports = defaultConfig()`);
      const config = getModuleExportsObject(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = mergeConfig(defaultConfig(), {
  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
})`);
    });

    it('merge var function call', () => {
      const mod = parseModule(`const config = defaultConfig()`);
      const config = getConfigVariable(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`const config = mergeConfig(defaultConfig(), {
  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
})`);
    });
  });

  describe('addSentrySerializerToMetroConfig', () => {
    it('add to empty config', () => {
      const mod = parseModule(`module.exports = {
        other: 'config'
      }`);
      const config = getModuleExportsObject(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = {
  other: 'config',

  serializer: {
    customSerializer: createSentryMetroSerializer()
  }
}`);
    });

    it('add to existing serializer config', () => {
      const mod = parseModule(`module.exports = {
  other: 'config',
  serializer: {
    other: 'config'
  }
}`);
      const config = getModuleExportsObject(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = {
  other: 'config',
  serializer: {
    other: 'config',
    customSerializer: createSentryMetroSerializer()
  }
}`);
    });

    it('not add to existing customSerializer config', () => {
      const mod = parseModule(`module.exports = {
  other: 'config',
  serializer: {
    other: 'config',
    customSerializer: 'existing-serializer'
  }
}`);
      const config = getModuleExportsObject(mod);
      const result = addSentrySerializer(config);
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = {
  other: 'config',
  serializer: {
    other: 'config',
    customSerializer: 'existing-serializer'
  }
}`);
    });
  });

  describe('addSentrySerializerImportToMetroConfig', () => {
    it('add import', () => {
      const mod =
        parseModule(`const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

module.exports = {
  other: 'config'
}`);
      const result = addSentrySerializerRequireToMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const {
  createSentryMetroSerializer
} = require("@sentry/react-native/dist/js/tools/sentryMetroSerializer");

module.exports = {
  other: 'config'
}`);
    });
  });

  describe('getMetroConfigObject', () => {
    it('get config object from variable called config', () => {
      const mod = parseModule(`var config = { some: 'config' };`);
      const config = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).key as t.Identifier
        ).name,
      ).toBe('some');
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config object from const called config', () => {
      const mod = parseModule(`const config = { some: 'config' };`);
      const config = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).key as t.Identifier
        ).name,
      ).toBe('some');
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config oject from let called config', () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const config = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).key as t.Identifier
        ).name,
      ).toBe('some');
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config object from module.exports', () => {
      const mod = parseModule(`module.exports = { some: 'config' };`);
      const config = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).key as t.Identifier
        ).name,
      ).toBe('some');
      expect(
        (
          (
            (config?.object as t.ObjectExpression)
              .properties[0] as t.ObjectProperty
          ).value as t.StringLiteral
        ).value,
      ).toBe('config');
    });
  });

  describe('remove @sentry require', () => {
    it('nothing to remove', () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const result = removeSentryRequire(mod.$ast as t.Program);
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(
        `let config = { some: 'config' };`,
      );
    });

    it('remove metro serializer import', () => {
      const mod = parseModule(`const {
  createSentryMetroSerializer,
} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');
let config = { some: 'config' };`);
      const result = removeSentryRequire(mod.$ast as t.Program);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(
        `let config = { some: 'config' };`,
      );
    });

    it('remove all sentry imports', () => {
      const mod = parseModule(`const {
  createSentryMetroSerializer,
} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');
var Sentry = require('@sentry/react-native');
let SentryIntegrations = require('@sentry/integrations');

let config = { some: 'config' };`);
      const result = removeSentryRequire(mod.$ast as t.Program);
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(
        `let config = { some: 'config' };`,
      );
    });
  });

  describe('remove sentryMetroSerializer', () => {
    it('no custom serializer to remove', async () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const result = await removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(
        `let config = { some: 'config' };`,
      );
    });

    it('no Sentry custom serializer to remove', async () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: 'existing-serializer',
    other: 'config',
  },
  other: 'config',
};`);
      const result = await removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(`let config = {
  serializer: {
    customSerializer: 'existing-serializer',
    other: 'config',
  },
  other: 'config',
};`);
    });

    it('Sentry serializer to remove', async () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: createSentryMetroSerializer(),
    other: 'config',
  },
  other: 'config',
};`);
      const result = await removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`let config = {
  serializer: {
    other: 'config'
  },
  other: 'config',
};`);
    });

    it('Sentry serializer to remove with wrapped serializer', async () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: createSentryMetroSerializer(wrappedSerializer()),
    other: 'config',
  },
  other: 'config',
};`);
      const result = await removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`let config = {
  serializer: {
    customSerializer: wrappedSerializer(),
    other: 'config',
  },
  other: 'config',
};`);
    });
  });

  describe('addMergeConfigRequire', () => {
    it('add merge config from metro', () => {
      const code = `const { getDefaultConfig } = require('@react-native-community/metro');`;
      const mod =
        parseModule(code);
      const result = addMergeConfigRequire(
        code,
        mod.$ast as t.Program,
        {},
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`const { getDefaultConfig } = require('@react-native-community/metro');

const {
  mergeConfig
} = require("metro");`);
    });

    it('add merge config from react native', () => {
      const code = `const { getDefaultConfig } = require('@react-native-community/metro');`;
      const mod =
        parseModule(code);
      const result = addMergeConfigRequire(
        code,
        mod.$ast as t.Program,
        {
          dependencies: {
            "@react-native/metro-config": "0.72.0",
          },
        },
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`const { getDefaultConfig } = require('@react-native-community/metro');

const {
  mergeConfig
} = require("@react-native/metro-config");`);
    });

    it('do not add merge config it exists', () => {
      const code = `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');`;
      const mod =
        parseModule(code);
      const result = addMergeConfigRequire(
        code,
        mod.$ast as t.Program,
        {},
      );
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');`);
    });
  });
});

function getConfigVariable(
  mod: ProxifiedModule,
  index = 0,
): {
  object: t.CallExpression | t.Identifier;
  owner: t.VariableDeclaration;
} {
  return {
    object: (
      ((mod.$ast as t.Program).body[index] as t.VariableDeclaration)
        .declarations[0] as t.VariableDeclarator
    ).init as t.CallExpression | t.Identifier,
    owner: (mod.$ast as t.Program).body[index] as t.VariableDeclaration,
  };
}

function getModuleExportsObject(
  mod: ProxifiedModule,
  index = 0,
): {
  object: t.ObjectExpression;
  owner: t.AssignmentExpression;
} {
  return {
    object: (
      ((mod.$ast as t.Program).body[index] as t.ExpressionStatement)
        .expression as t.AssignmentExpression
    ).right as t.ObjectExpression,
    owner: ((mod.$ast as t.Program).body[index] as t.ExpressionStatement)
      .expression as t.AssignmentExpression,
  };
}
