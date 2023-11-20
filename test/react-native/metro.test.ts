// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { ProxifiedModule, parseModule } from 'magicast';
import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

import { addSentrySerializerToMetroConfig } from '../../src/react-native/metro';

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
});

function getModuleExportsObject(mod: ProxifiedModule): t.ObjectExpression {
  return (((mod.$ast as t.Program).body[0] as t.ExpressionStatement).expression as t.AssignmentExpression).right as t.ObjectExpression;
}
