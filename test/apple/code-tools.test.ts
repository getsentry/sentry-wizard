import * as os from 'os';
import * as path from 'path';
import { addCodeSnippetToProject } from '../../src/apple/code-tools';

describe('code-tools', () => {
  describe('addCodeSnippetToProject', () => {
    describe('app delegate file is not found', () => {
      it('should return false', () => {
        // -- Act --
        const result = addCodeSnippetToProject(
          path.join(os.tmpdir(), 'test-project'),
          ['AppDelegate.swift'],
          'https://example.com/sentry-dsn',
        );
        // -- Assert --
        expect(result).toBeFalsy();
      });
    });
  });
});
