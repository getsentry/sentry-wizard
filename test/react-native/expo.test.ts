import { describe, expect, test } from 'vitest';
import { addWithSentryToAppConfigJson } from '../../src/react-native/expo';
import { RNCliSetupConfigContent } from '../../src/react-native/react-native-wizard';

describe('expo', () => {
  const MOCK_CONFIG: RNCliSetupConfigContent = {
    url: 'https://sentry.mock/',
    org: 'sentry-mock',
    project: 'project-mock',
    authToken: 'authToken-mock',
  };

  describe('addWithSentryToAppConfigJson', () => {
    test('do not add if sentry-expo present', () => {
      const appConfigJson = `{
        "expo": {
          "plugins": ["sentry-expo"]
        }
      }`;
      expect(
        addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG),
      ).toBeNull();
    });

    test('do not add if sentry-react-native/expo present', () => {
      const appConfigJson = `{
        "expo": {
          "plugins": ["@sentry/react-native/expo"]
        }
      }`;
      expect(
        addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG),
      ).toBeNull();
    });

    test.each([
      [
        `{
          "expo": {
            "plugins": "should be an array, but it is not"
          }
        }`,
      ],
      [
        `{
          "expo": ["should be an object, but it is not"]
        }`,
      ],
    ])('do not add if plugins is not an array', (appConfigJson) => {
      expect(
        addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG),
      ).toBeNull();
    });

    test.each([
      [
        `{
          "expo": {
            "plugins": []
          }
        }`,
      ],
      [`{}`],
      [
        `{
          "expo": {}
        }`,
      ],
    ])('add sentry react native expo plugin configuration', (appConfigJson) => {
      const result = addWithSentryToAppConfigJson(appConfigJson, MOCK_CONFIG);
      expect(JSON.parse(result ?? '{}')).toStrictEqual({
        expo: {
          plugins: [
            [
              '@sentry/react-native/expo',
              {
                url: 'https://sentry.mock/',
                organization: 'sentry-mock',
                project: 'project-mock',
              },
            ],
          ],
        },
      });
    });
  });
});
