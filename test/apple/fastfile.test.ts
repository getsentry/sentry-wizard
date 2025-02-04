import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fastFile } from '../../src/apple/fastlane';

describe('fastlane', () => {
  describe('#fastFile', () => {
    describe('file exists', () => {
      it('should return path', () => {
        // -- Arrange --
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-project'));
        const fastlaneDir = path.join(tempDir, 'fastlane');
        fs.mkdirSync(fastlaneDir);

        const fastfile = path.join(fastlaneDir, 'Fastfile');
        fs.writeFileSync(fastfile, 'lane :test do');

        // -- Act --
        const result = fastFile(tempDir);

        // -- Assert --
        expect(result).toBe(fastfile);
      });
    });

    describe('file does not exist', () => {
      it('should return null', () => {
        // -- Arrange --
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'test-project', 'fastlane'),
        );
        fs.mkdirSync(path.join(tempDir, 'fastlane'));

        // -- Act --
        const result = fastFile(tempDir);

        // -- Assert --
        expect(result).toBeNull();
      });
    });
  });
});
