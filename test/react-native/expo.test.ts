// @ts-ignore - magicast is ESM and TS complains about that. It works though
import { generateCode, parseModule } from 'magicast';

import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;
const b = recast.types.builders;

import {
  addWithSentryToAppConfigJson,
  isExpoManagedProject,
  getModuleExports,
  addExpoPluginRequire,
  getExportDefault,
  addExpoPluginImport,
  wrapWithSentry,
  getSentryAppConfigJsonFileContent,
} from '../../src/react-native/expo';
import { RNCliSetupConfigContent } from '../../src/react-native/react-native-wizard';

describe('expo', () => {
  const MOCK_CONFIG: RNCliSetupConfigContent = {
    url: 'https://sentry.mock/',
    org: 'sentry-mock',
    project: 'project-mock',
    authToken: 'authToken-mock',
  };

  describe('isExpoManagedProject', () => {
    test('true when has expo entry point and expo installed', () => {
      const project = {
        main: 'node_modules/expo/AppEntry.js',
        dependencies: {
          expo: '1.0.0',
        },
      };
      expect(isExpoManagedProject(project)).toBe(true);
    });
    test('false when missing expo package', () => {
      const project = {
        main: 'node_modules/expo/AppEntry.js',
        dependencies: {},
      };
      expect(isExpoManagedProject(project)).toBe(false);
    });
    test('false when not set expo entry point', () => {
      const project = {
        main: 'index.js',
        dependencies: {
          expo: '1.0.0',
        },
      };
      expect(isExpoManagedProject(project)).toBe(false);
    });
  });

  describe('addWithSentryToAppConfigJson', () => {
    test('do not add if sentry-expo present', () => {
      const appConfigJson = `{
        expo: {
          plugins: ['sentry-expo'],
        },
      }`;
      expect(
        addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG),
      ).toBeNull();
    });

    test('do not add if sentry-react-native/expo present', () => {
      const appConfigJson = `{
        expo: {
          plugins: ['sentry-react-native/expo'],
        },
      }`;
      expect(
        addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG),
      ).toBeNull();
    });

    test('add including auth token and commit warning', () => {
      const appConfigJson = `{
        expo: {
          plugins: [],
        },
      }`;
      const result = addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG);
      expect(JSON.parse(result ?? '')).toStrictEqual({
        expo: {
          plugins: [
            [
              '@sentry/react-native/expo',
              {
                url: 'https://sentry.mock/',
                org: 'sentry-mock',
                project: 'project-mock',
                authToken: 'authToken-mock',
                warning:
                  'DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD',
              },
            ],
          ],
        },
      });
    });
  });

  describe('getExportsModule', () => {
    const parseMockAssignmentExpression = (code: string) =>
      ((parseModule(code).$ast as t.Program).body[0] as t.ExpressionStatement)
        .expression;

    test('returns module.exports', () => {
      const code = parseModule(`module.exports = mock`).$ast as t.Program;
      expect(getModuleExports(code)).toEqual(
        parseMockAssignmentExpression(`module.exports = mock`),
      );
    });
    test('returns null if only export', () => {
      const code = parseModule(`export {};`).$ast as t.Program;
      expect(getModuleExports(code)).toBeNull();
    });
    test('returns null if no export', () => {
      const code = parseModule(`const a = 1;`).$ast as t.Program;
      expect(getModuleExports(code)).toBeNull();
    });
    test('returns null if default export', () => {
      const code = parseModule(`export default {};`).$ast as t.Program;
      expect(getModuleExports(code)).toBeNull();
    });
  });

  describe('addExpoPluginRequire', () => {
    test('adds expo plugin require to the first line', () => {
      const code = parseModule(`const a = 1;`).$ast;
      addExpoPluginRequire(code as t.Program);
      expect(generateCode({ $ast: code }).code).toBe(`const {
  withSentry
} = require("@sentry/react-native/expo");

const a = 1;`);
    });
  });

  describe('getExportDefault', () => {
    const parseMockDefaultExport = (code: string) =>
      (parseModule(code).$ast as t.Program)
        .body[0] as t.ExportDefaultDeclaration;

    test('returns default export', () => {
      const code = parseModule(`export default mock;`).$ast as t.Program;
      expect(getExportDefault(code)).toEqual(
        parseMockDefaultExport(`export default mock;`),
      );
    });
    test('returns null if only export', () => {
      const code = parseModule(`export {};`).$ast as t.Program;
      expect(getExportDefault(code)).toBeNull();
    });
    test('returns null if no export', () => {
      const code = parseModule(`const a = 1;`).$ast as t.Program;
      expect(getExportDefault(code)).toBeNull();
    });
    test('returns null if exports.module', () => {
      const code = parseModule(`exports.module = {};`).$ast as t.Program;
      expect(getExportDefault(code)).toBeNull();
    });
  });

  describe('addExpoPluginImport', () => {
    test('adds expo plugin import to the first line', () => {
      const code = parseModule(`const a = 1;`).$ast;
      addExpoPluginImport(code as t.Program);
      expect(generateCode({ $ast: code }).code)
        .toBe(`import { withSentry } from "@sentry/react-native/expo";
const a = 1;`);
    });
  });

  describe('wrapWithSentry', () => {
    const getParsed = (code: string) =>
      ((parseModule(code).$ast as t.Program).body[0] as t.ExpressionStatement)
        .expression;
    const toString = (
      node: t.CallExpression | t.Identifier | t.ObjectExpression,
    ) => {
      const mod = parseModule(``);
      (mod.$ast as t.Program).body.push(b.expressionStatement(node));
      return generateCode(mod).code;
    };

    it.each([
      ['call expression', 'mock()'],
      ['identifier', 'mock'],
      ['objectExpression', '({})'],
    ])('wraps %s', (_, toBeWrapped) => {
      const callExpression = getParsed(toBeWrapped) as t.CallExpression;
      expect(toString(wrapWithSentry(callExpression, MOCK_CONFIG)))
        .toBe(`withSentry(
  ${toBeWrapped},
  {
    url: "https://sentry.mock/",

    // DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD
    authToken: "authToken-mock",

    project: "project-mock",
    organization: "sentry-mock"
  }
);`);
    });

    describe('getSentryAppConfigJsonFileContent', () => {
      it('returns null if no app.config.json', () => {
        const raw = getSentryAppConfigJsonFileContent(MOCK_CONFIG);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(raw);
        expect(parsed).toEqual({
          plugins: [
            [
              '@sentry/react-native/expo',
              {
                url: 'https://sentry.mock/',
                organization: 'sentry-mock',
                project: 'project-mock',
                authToken: 'authToken-mock',
                warning:
                  'DO NOT COMMIT YOUR AUTH TOKEN, USE SENTRY_AUTH_TOKEN ENVIRONMENT VARIABLE INSTEAD',
              },
            ],
          ],
        });
      });
    });
  });
});
