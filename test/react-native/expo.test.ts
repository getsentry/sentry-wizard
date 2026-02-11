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
      expect(git.isFolderInGitignore).not.toHaveBeenCalled();
    });

    test('returns true when only ios exists and is in gitignore (android considered ignored)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'ios');
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      const result = await isExpoCNG();

      expect(result).toBe(true);
      // Should only check ios since android doesn't exist (auto-resolves to true)
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(1);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('ios');
    });

    test('returns true when only android exists and is in gitignore (ios considered ignored)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'android');
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      const result = await isExpoCNG();

      expect(result).toBe(true);
      // Should only check android since ios doesn't exist (auto-resolves to true)
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(1);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('android');
    });

    test('returns false when only ios exists but is NOT in gitignore', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'ios');
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(false);

      const result = await isExpoCNG();

      expect(result).toBe(false);
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(1);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('ios');
    });

    test('returns true when both folders exist AND both are in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      const result = await isExpoCNG();

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('ios');
      expect(fs.existsSync).toHaveBeenCalledWith('android');
      // Should check both folders with Promise.all
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(2);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('ios');
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('android');
    });

    test('returns false when both folders exist BUT neither is in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(false);

      const result = await isExpoCNG();

      expect(result).toBe(false);
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(2);
    });

    test('returns false when both folders exist but only ios is in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockImplementation((folder) =>
        Promise.resolve(folder === 'ios'),
      );

      const result = await isExpoCNG();

      expect(result).toBe(false);
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(2);
    });

    test('returns false when both folders exist but only android is in gitignore', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockImplementation((folder) =>
        Promise.resolve(folder === 'android'),
      );

      const result = await isExpoCNG();

      expect(result).toBe(false);
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(2);
    });

    test('uses Promise.all to check both folders in parallel when both exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      await isExpoCNG();

      // Should check both folders
      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(2);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('ios');
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('android');
    });

    test('only checks existing folders', async () => {
      // Test when only ios exists
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'ios');
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      await isExpoCNG();

      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(1);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('ios');

      // Reset and test when only android exists
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockImplementation((path) => path === 'android');
      vi.mocked(git.isFolderInGitignore).mockResolvedValue(true);

      await isExpoCNG();

      expect(git.isFolderInGitignore).toHaveBeenCalledTimes(1);
      expect(git.isFolderInGitignore).toHaveBeenCalledWith('android');

      // Reset and test when neither exists
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await isExpoCNG();

      expect(git.isFolderInGitignore).not.toHaveBeenCalled();
    });

    test('handles errors from isFolderInGitignore gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(git.isFolderInGitignore).mockRejectedValue(
        new Error('File system error'),
      );

      const result = await isExpoCNG();

      // Should catch error and return false instead of throwing
      expect(result).toBe(false);
    });
  });
});
