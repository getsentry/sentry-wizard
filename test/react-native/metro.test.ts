import 'core-js/features/array/at'; // used by mod.generate()
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import type { ProxifiedModule, parseModule as parseModuleType } from 'magicast';
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const magicast = require('magicast');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
const parseModule: typeof parseModuleType = magicast.parseModule;
import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

import {
  addSentrySerializerRequireToMetroConfig,
  addSentrySerializerToMetroConfig,
  getMetroConfigObject,
  removeSentryRequire,
  removeSentrySerializerFromMetroConfig,
} from '../../src/react-native/metro';

describe('patch metro config - sentry serializer', () => {
  describe('addSentrySerializerToMetroConfig', () => {
    it('add to empty config', () => {
      const mod = parseModule(`module.exports = {
        other: 'config'
      }`);
      const configObject = getModuleExportsObject(mod);
      const result = addSentrySerializerToMetroConfig(configObject);
      expect(result).toBe(true);
      expect(mod.generate().code).toBe(`module.exports = {
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
      expect(mod.generate().code).toBe(`module.exports = {
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
      expect(mod.generate().code).toBe(`module.exports = {
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
      expect(mod.generate().code)
        .toBe(`const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const {
  createSentryMetroSerializer
} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');

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
      expect(mod.generate().code).toBe(`let config = { some: 'config' };`);
    });

    it('remove metro serializer import', () => {
      const mod = parseModule(`const {
  createSentryMetroSerializer,
} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');
let config = { some: 'config' };`);
      const result = removeSentryRequire(mod.$ast as t.Program);
      expect(result).toBe(true);
      expect(mod.generate().code).toBe(`let config = { some: 'config' };`);
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
      expect(mod.generate().code).toBe(`let config = { some: 'config' };`);
    });
  });

  describe('remove sentryMetroSerializer', () => {
    it('no custom serializer to remove', () => {
      const mod = parseModule(`let config = { some: 'config' };`);
      const result = removeSentrySerializerFromMetroConfig(
        mod.$ast as t.Program,
      );
      expect(result).toBe(false);
      expect(mod.generate().code).toBe(`let config = { some: 'config' };`);
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
      expect(mod.generate().code).toBe(`let config = {
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
      expect(mod.generate().code).toBe(`let config = {
  serializer: {
    other: 'config',
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
      expect(mod.generate().code).toBe(`let config = {
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
