import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  addWithSentryToAppConfigJson,
  isExpoCNG,
} from '../../src/react-native/expo';
import { RNCliSetupConfigContent } from '../../src/react-native/react-native-wizard';
import * as fs from 'fs';
import * as git from '../../src/react-native/git';

// Mock modules
vi.mock('fs');
vi.mock('../../src/react-native/git');

describe('expo', () => {
  const MOCK_CONFIG: RNCliSetupConfigContent = {
    url: 'https://sentry.mock/',
    org: 'sentry-mock',
    project: 'project-mock',
    authToken: 'authToken-mock',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe('isExpoCNG', () => {
    test('returns true when neither ios nor android folders exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await isExpoCNG();

      expect(result).toBe(true);
      // Should check for ios folder existence
      expect(fs.existsSync).toHaveBeenCalled();
      // Should not check gitignore if folders don't exist
      expect(git.areNativeFoldersInGitignore).not.toHaveBeenCalled();
    });

    test('returns true when only ios folder exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'ios');

      const result = await isExpoCNG();

      expect(result).toBe(true);
      expect(git.areNativeFoldersInGitignore).not.toHaveBeenCalled();
    });

    test('returns true when only android folder exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'android');

      const result = await isExpoCNG();

      expect(result).toBe(true);
      expect(git.areNativeFoldersInGitignore).not.toHaveBeenCalled();
    });

    test('returns true when both folders exist AND are in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.areNativeFoldersInGitignore).mockResolvedValue(true);

      const result = await isExpoCNG();

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('ios');
      expect(fs.existsSync).toHaveBeenCalledWith('android');
      expect(git.areNativeFoldersInGitignore).toHaveBeenCalledTimes(1);
    });

    test('returns false when both folders exist BUT are NOT in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.areNativeFoldersInGitignore).mockResolvedValue(false);

      const result = await isExpoCNG();

      expect(result).toBe(false);
      expect(fs.existsSync).toHaveBeenCalledWith('ios');
      expect(fs.existsSync).toHaveBeenCalledWith('android');
      expect(git.areNativeFoldersInGitignore).toHaveBeenCalledTimes(1);
    });

    test('calls areNativeFoldersInGitignore only when both folders exist', async () => {
      // Test when both exist
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.areNativeFoldersInGitignore).mockResolvedValue(true);

      await isExpoCNG();

      expect(git.areNativeFoldersInGitignore).toHaveBeenCalledTimes(1);

      // Reset and test when they don't exist
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await isExpoCNG();

      expect(git.areNativeFoldersInGitignore).not.toHaveBeenCalled();
    });

    test('handles errors from areNativeFoldersInGitignore gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.areNativeFoldersInGitignore).mockRejectedValue(
        new Error('File system error'),
      );

      await expect(isExpoCNG()).rejects.toThrow('File system error');
    });
  });
});
