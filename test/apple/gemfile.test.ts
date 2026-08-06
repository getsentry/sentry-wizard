import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { addSentryPluginToGemfile, gemFile } from '../../src/apple/gemfile';
import { describe, expect, it } from 'vitest';

describe('gemfile', () => {
  describe('#gemFile', () => {
    describe('file exists', () => {
      it('should return path', () => {
        // -- Arrange --
        const projectPath = createProjectDir();
        const gemfilePath = createGemfile(projectPath, 'gem "fastlane"');

        // -- Act --
        const result = gemFile(projectPath);

        // -- Assert --
        expect(result).toBe(gemfilePath);
      });
    });

    describe('file does not exist', () => {
      it('should return null', () => {
        // -- Arrange --
        const projectPath = createProjectDir();
        // do not create Gemfile

        // -- Act --
        const result = gemFile(projectPath);

        // -- Assert --
        expect(result).toBeNull();
      });
    });
  });

  describe('#addSentryPluginToGemfile', () => {
    describe('Gemfile not found', () => {
      it('should return false', () => {
        // -- Arrange --
        const projectPath = createProjectDir();
        // do not create Gemfile

        // -- Act --
        const result = addSentryPluginToGemfile(projectPath);

        // -- Assert --
        expect(result).toBe(false);
      });
    });

    describe('sentry plugin already exists', () => {
      it('should return true without modifying Gemfile', () => {
        // -- Arrange --
        const projectPath = createProjectDir();
        const originalContent = `source 'https://rubygems.org'
gem 'fastlane-plugin-sentry'
gem 'fastlane'`;
        const gemfilePath = createGemfile(projectPath, originalContent);

        // -- Act --
        const result = addSentryPluginToGemfile(projectPath);

        // -- Assert --
        expect(result).toBe(true);
        expect(fs.readFileSync(gemfilePath, 'utf8')).toBe(originalContent);
      });
    });

    describe('adds sentry plugin to Gemfile', () => {
      describe('after other fastlane plugins', () => {
        it('should add after the last fastlane plugin', () => {
          // -- Arrange --
          const projectPath = createProjectDir();
          const originalContent = `source 'https://rubygems.org'
gem 'fastlane-plugin-badge'
gem 'fastlane-plugin-firebase_app_distribution'
gem 'fastlane'`;
          const gemfilePath = createGemfile(projectPath, originalContent);

          // -- Act --
          const result = addSentryPluginToGemfile(projectPath);

          // -- Assert --
          expect(result).toBe(true);
          expect(fs.readFileSync(gemfilePath, 'utf8'))
            .toBe(`source 'https://rubygems.org'
gem 'fastlane-plugin-badge'
gem 'fastlane-plugin-firebase_app_distribution'
gem 'fastlane-plugin-sentry'
gem 'fastlane'`);
        });
      });

      describe('after fastlane gem', () => {
        it('should add after fastlane gem when no other plugins exist', () => {
          // -- Arrange --
          const projectPath = createProjectDir();
          const originalContent = `source 'https://rubygems.org'
gem 'fastlane'
gem 'cocoapods'`;
          const gemfilePath = createGemfile(projectPath, originalContent);

          // -- Act --
          const result = addSentryPluginToGemfile(projectPath);

          // -- Assert --
          expect(result).toBe(true);
          expect(fs.readFileSync(gemfilePath, 'utf8'))
            .toBe(`source 'https://rubygems.org'
gem 'fastlane'
gem 'fastlane-plugin-sentry'
gem 'cocoapods'`);
        });
      });

      describe('at the end of file', () => {
        it('should add at the end when no fastlane gems exist', () => {
          // -- Arrange --
          const projectPath = createProjectDir();
          const originalContent = `source 'https://rubygems.org'
gem 'cocoapods'`;
          const gemfilePath = createGemfile(projectPath, originalContent);

          // -- Act --
          const result = addSentryPluginToGemfile(projectPath);

          // -- Assert --
          expect(result).toBe(true);
          expect(fs.readFileSync(gemfilePath, 'utf8'))
            .toBe(`source 'https://rubygems.org'
gem 'cocoapods'
gem 'fastlane-plugin-sentry'
`);
        });

        it('should add at the end when fastlane gem is at the end of file', () => {
          // -- Arrange --
          const projectPath = createProjectDir();
          const originalContent = `source 'https://rubygems.org'
gem 'cocoapods'
gem 'fastlane'`;
          const gemfilePath = createGemfile(projectPath, originalContent);

          // -- Act --
          const result = addSentryPluginToGemfile(projectPath);

          // -- Assert --
          expect(result).toBe(true);
          expect(fs.readFileSync(gemfilePath, 'utf8'))
            .toBe(`source 'https://rubygems.org'
gem 'cocoapods'
gem 'fastlane'
gem 'fastlane-plugin-sentry'
`);
        });
      });
    });
  });
});

function createProjectDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-project'));
}

function createGemfile(projectPath: string, content: string) {
  const gemfilePath = path.join(projectPath, 'Gemfile');
  fs.writeFileSync(gemfilePath, content);
  return gemfilePath;
}
