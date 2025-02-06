import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fastFile } from '../../src/apple/fastlane';

describe('fastlane', () => {
  describe('#fastFile', () => {
    describe('file exists', () => {
      it('should return path', () => {
        // -- Arrange --
        const projectPath = fs.mkdtempSync(
          path.join(os.tmpdir(), 'test-project'),
        );
        const fastlaneDir = path.join(projectPath, 'fastlane');
        fs.mkdirSync(fastlaneDir, {
          recursive: true,
        });

        const fastfile = path.join(fastlaneDir, 'Fastfile');
        fs.writeFileSync(fastfile, 'lane :test do');

        // -- Act --
        const result = fastFile(projectPath);

        // -- Assert --
        expect(result).toBe(fastfile);
      });
    });

    describe('file does not exist', () => {
      it('should return null', () => {
        // -- Arrange --
        const projectPath = fs.mkdtempSync(
          path.join(os.tmpdir(), 'test-project'),
        );
        const fastlaneDir = path.join(projectPath, 'fastlane');
        fs.mkdirSync(fastlaneDir, {
          recursive: true,
        });

        // -- Act --
        const result = fastFile(projectPath);

        // -- Assert --
        expect(result).toBeNull();
      });
    });
  });
});
