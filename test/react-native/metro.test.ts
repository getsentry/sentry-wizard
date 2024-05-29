// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, type ProxifiedModule, parseModule } from 'magicast';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

import {
  addSentrySerializerRequireToMetroConfig,
  addSentrySerializerToMetroConfig,
  getMetroConfigObject,
  patchMetroWithSentryConfigInMemory,
  removeSentryRequire,
  removeSentrySerializerFromMetroConfig,
} from '../../src/react-native/metro';

describe('patch metro config - sentry serializer', () => {
  describe('patchMetroWithSentryConfigInMemory', () => {
    it('patches react native 0.72 default metro config', async () => {
      const mod =
        parseModule(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);`);

      const result = await patchMetroWithSentryConfigInMemory(mod, async () => {
        /* noop */
      });
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code)
        .toBe(`const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const {
 withSentryConfig
} = require("@sentry/react-native/metro");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

module.exports = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));`);
    });

    it('patches react native 0.65 default metro config', async () => {
      const mod = parseModule(`/**
* Metro configuration for React Native
* https://github.com/facebook/react-native
*
* @format
*/

module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};`);

      const result = await patchMetroWithSentryConfigInMemory(mod, async () => {
        /* noop */
      });
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`const {
  withSentryConfig
} = require("@sentry/react-native/metro");

/**
* Metro configuration for React Native
* https://github.com/facebook/react-native
*
* @format
*/

module.exports = withSentryConfig({
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
});`);
    });

    it('patches react native metro config exported variable', async () => {
      const mod = parseModule(`const testConfig = {};

module.exports = testConfig;`);

      const result = await patchMetroWithSentryConfigInMemory(mod, async () => {
        /* noop */
      });
      expect(result).toBe(true);
      expect(generateCode(mod.$ast).code).toBe(`const {
  withSentryConfig
} = require("@sentry/react-native/metro");

const testConfig = {};

module.exports = withSentryConfig(testConfig);`);
    });

    it('does not patch react native metro config exported as factory function', async () => {
      const mod = parseModule(`module.exports = () => ({});`);

      const result = await patchMetroWithSentryConfigInMemory(mod, async () => {
        /* noop */
      });
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(`module.exports = () => ({});`);
    });
  });

  describe('addSentrySerializerToMetroConfig', () => {
    it('add to empty config', () => {
      const mod = parseModule(`module.exports = {
        other: 'config'
      }`);
      const configObject = getModuleExportsObject(mod);
      const result = addSentrySerializerToMetroConfig(configObject);
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
      const configObject = getModuleExportsObject(mod);
      const result = addSentrySerializerToMetroConfig(configObject);
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
      const configObject = getModuleExportsObject(mod);
      const result = addSentrySerializerToMetroConfig(configObject);
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
      const configObject = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        ((configObject?.properties[0] as t.ObjectProperty).key as t.Identifier)
          .name,
      ).toBe('some');
      expect(
        (
          (configObject?.properties[0] as t.ObjectProperty)
            .value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config object from const called config', () => {
      const mod = parseModule(`const config = { some: 'config' };`);
      const configObject = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        ((configObject?.properties[0] as t.ObjectProperty).key as t.Identifier)
          .name,
      ).toBe('some');
      expect(
        (
          (configObject?.properties[0] as t.ObjectProperty)
            .value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config oject from let called config', () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const configObject = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        ((configObject?.properties[0] as t.ObjectProperty).key as t.Identifier)
          .name,
      ).toBe('some');
      expect(
        (
          (configObject?.properties[0] as t.ObjectProperty)
            .value as t.StringLiteral
        ).value,
      ).toBe('config');
    });

    it('get config object from module.exports', () => {
      const mod = parseModule(`module.exports = { some: 'config' };`);
      const configObject = getMetroConfigObject(mod.$ast as t.Program);
      expect(
        ((configObject?.properties[0] as t.ObjectProperty).key as t.Identifier)
          .name,
      ).toBe('some');
      expect(
        (
          (configObject?.properties[0] as t.ObjectProperty)
            .value as t.StringLiteral
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
    it('no custom serializer to remove', () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const result = removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(false);
      expect(generateCode(mod.$ast).code).toBe(
        `let config = { some: 'config' };`,
      );
    });

    it('no Sentry custom serializer to remove', () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: 'existing-serializer',
    other: 'config',
  },
  other: 'config',
};`);
      const result = removeSentrySerializerFromMetroConfig(
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

    it('Sentry serializer to remove', () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: createSentryMetroSerializer(),
    other: 'config',
  },
  other: 'config',
};`);
      const result = removeSentrySerializerFromMetroConfig(
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

    it('Sentry serializer to remove with wrapped serializer', () => {
      const mod = parseModule(`let config = {
  serializer: {
    customSerializer: createSentryMetroSerializer(wrappedSerializer()),
    other: 'config',
  },
  other: 'config',
};`);
      const result = removeSentrySerializerFromMetroConfig(
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
});

function getModuleExportsObject(
  mod: ProxifiedModule,
  index = 0,
): t.ObjectExpression {
  return (
    ((mod.$ast as t.Program).body[index] as t.ExpressionStatement)
      .expression as t.AssignmentExpression
  ).right as t.ObjectExpression;
}
