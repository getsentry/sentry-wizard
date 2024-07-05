// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';
import { patchMetroInMemory } from '../../src/react-native/expo-metro';

describe('expo-metro config', () => {

  test('patches minimal expo config', () => {
    const mod =
      parseModule(`
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push(
  // Adds support for .db files for SQLite databases
  'db'
);

module.exports = config;
      `);

    const result = patchMetroInMemory(mod);
    expect(result).toBe(true);
    expect(generateCode(mod.$ast).code)
      .toBe(`
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

config.resolver.assetExts.push(
  // Adds support for .db files for SQLite databases
  'db'
);

module.exports = config;
`.trim());
  });

  test('keeps expo metro config if other imports are present', () => {
    const mod =
      parseModule(`
const { getDefaultConfig, otherExport } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
      `);

    const result = patchMetroInMemory(mod);
    expect(result).toBe(true);
    expect(generateCode(mod.$ast).code)
      .toBe(`
const { getDefaultConfig, otherExport } = require("expo/metro-config");

const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

module.exports = config;
`.trim());
  });

  test('does not modify when sentry already present', () => {
    const mod =
      parseModule(`
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
`);

    const result = patchMetroInMemory(mod);
    expect(result).toBe(false);
    expect(generateCode(mod.$ast).code)
      .toBe(`
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
`.trim());
  });
});
