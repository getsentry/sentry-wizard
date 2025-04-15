import { beforeEach, describe, it, vi, expect } from 'vitest';

import {
  getUncommittedOrUntrackedFiles,
  isInGitRepo,
} from '../../src/utils/git';

const { mockedExecSync } = vi.hoisted(() => {
  return { mockedExecSync: vi.fn() };
});

vi.mock('child_process', async () => {
  return {
    default: {},
    ...(await vi.importActual('child_process')),
    execSync: mockedExecSync,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isInGitRepo', () => {
  it('returns true if the git command process exits with 0', () => {
    mockedExecSync.mockImplementationOnce(() => {
      return 'true';
    });
    expect(isInGitRepo()).toBe(true);
  });

  it('returns false if the git command process exits with non-zero', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('Command failed');
    });
    expect(isInGitRepo()).toBe(false);
  });

  it('forwards cwd if provided', () => {
    mockedExecSync.mockImplementationOnce(() => {
      return 'true';
    });
    isInGitRepo({ cwd: '/path/to/dir' });
    expect(mockedExecSync).toHaveBeenCalledWith(
      'git rev-parse --is-inside-work-tree',
      {
        stdio: 'ignore',
        cwd: '/path/to/dir',
      },
    );
  });
});

describe('getUncommittedOrUntrackedFiles', () => {
  it('returns a list of uncommitted or untracked files', () => {
    mockedExecSync.mockImplementationOnce(() => {
      return (
        ' M file1.txt\n' +
        '?? file2.txt\n' +
        '?? file3.txt\n' +
        '?? file4.txt\n'
      );
    });
    expect(getUncommittedOrUntrackedFiles()).toEqual([
      '- file1.txt',
      '- file2.txt',
      '- file3.txt',
      '- file4.txt',
    ]);
  });

  it('returns an empty list if there are no uncommitted or untracked files', () => {
    mockedExecSync.mockImplementationOnce(() => {
      return '';
    });

    expect(getUncommittedOrUntrackedFiles()).toEqual([]);
  });

  it('returns an empty list if the git command fails', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('Command failed');
    });

    expect(getUncommittedOrUntrackedFiles()).toEqual([]);
  });
});
