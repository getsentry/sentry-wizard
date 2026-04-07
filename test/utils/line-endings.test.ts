import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fixLineEndings } from '../../src/utils/line-endings';
import * as git from '../../src/utils/git';

describe('fixLineEndings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-endings-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    vi.restoreAllMocks();
  });

  it('normalizes mixed line endings to CRLF when file has CRLF', () => {
    const filePath = path.join(tmpDir, 'mixed.txt');
    fs.writeFileSync(filePath, 'line1\r\nline2\nline3\r\n', 'utf8');

    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([
      `- ${filePath}`,
    ]);

    fixLineEndings();

    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toBe('line1\r\nline2\r\nline3\r\n');
  });

  it('skips files that are pure LF', () => {
    const filePath = path.join(tmpDir, 'lf.txt');
    const original = 'line1\nline2\n';
    fs.writeFileSync(filePath, original, 'utf8');

    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([
      `- ${filePath}`,
    ]);

    fixLineEndings();

    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toBe(original);
  });

  it('leaves consistent CRLF files unchanged', () => {
    const filePath = path.join(tmpDir, 'crlf.txt');
    const original = 'line1\r\nline2\r\n';
    fs.writeFileSync(filePath, original, 'utf8');

    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([
      `- ${filePath}`,
    ]);

    fixLineEndings();

    const result = fs.readFileSync(filePath, 'utf8');
    expect(result).toBe(original);
  });

  it('skips directories', () => {
    const dirPath = path.join(tmpDir, 'subdir');
    fs.mkdirSync(dirPath);

    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([
      `- ${dirPath}`,
    ]);

    expect(() => fixLineEndings()).not.toThrow();
  });

  it('skips nonexistent files', () => {
    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([
      '- nonexistent.txt',
    ]);

    expect(() => fixLineEndings()).not.toThrow();
  });

  it('does nothing when there are no modified files', () => {
    vi.spyOn(git, 'getUncommittedOrUntrackedFiles').mockReturnValue([]);

    expect(() => fixLineEndings()).not.toThrow();
  });
});
