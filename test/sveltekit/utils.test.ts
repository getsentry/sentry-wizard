import { describe, it, expect } from 'vitest';
import {
  getKitVersionBucket,
  getSvelteVersionBucket,
} from '../../src/sveltekit/utils';

describe('getKitVersionBucket', () => {
  it('returns "none" if version is undefined', () => {
    expect(getKitVersionBucket(undefined)).toBe('none');
  });

  it('returns "none" if version is empty string', () => {
    expect(getKitVersionBucket('')).toBe('none');
  });

  it('returns "invalid" if version is contradictory', () => {
    expect(getKitVersionBucket('>1.0.0 <1.0.0')).toBe('invalid');
  });

  it('returns "invalid" if version is invalid', () => {
    expect(getKitVersionBucket('latest')).toBe('invalid');
  });

  it.each(['0.1.0', '0.9.9', '^0.5.0', '~0.12.0', '0'])(
    'returns "0.x" for versions < 1.0.0',
    (version: string) => {
      expect(getKitVersionBucket(version)).toBe('0.x');
    },
  );

  it.each(['1.0.0', '1.1.0', '1.23.9', '^1.0.0', '~1.20.0', '>=1.0.0 <1.24.0'])(
    'returns ">=1.0.0 <1.24.0" for versions >= 1.0.0 and < 1.24.0',
    (version: string) => {
      expect(getKitVersionBucket(version)).toBe('>=1.0.0 <1.24.0');
    },
  );

  it.each([
    '1.24.0',
    '1.25.0',
    '2.0.0',
    '2.30.9',
    '^1.24.0',
    '~2.0.0',
    '>=1.24.0 <2.31.0',
  ])(
    'returns ">=1.24.0 <2.31.0" for versions >= 1.24.0 and < 2.31.0',
    (version: string) => {
      expect(getKitVersionBucket(version)).toBe('>=1.24.0 <2.31.0');
    },
  );

  it.each(['2.31.0', '2.32.0', '3.0.0', '^2.31.0', '~3.0.0', '>=2.31.0'])(
    'returns ">=2.31.0" for versions >= 2.31.0',
    (version: string) => {
      expect(getKitVersionBucket(version)).toBe('>=2.31.0');
    },
  );
});

describe('getSvelteVersionBucket', () => {
  it('returns "none" if version is undefined', () => {
    expect(getSvelteVersionBucket(undefined)).toBe('none');
  });

  it('returns "none" if version is empty string', () => {
    expect(getSvelteVersionBucket('')).toBe('none');
  });

  it('returns "invalid" if version is contradictory', () => {
    expect(getSvelteVersionBucket('>1.0.0 <1.0.0')).toBe('invalid');
  });

  it('returns "invalid" if version is invalid', () => {
    expect(getSvelteVersionBucket('latest')).toBe('invalid');
  });

  it.each(['0.1.0', '1.0.0', '2.9.9', '^2.5.0', '~2.0.0'])(
    'returns "<3.0.0" for versions < 3.0.0',
    (version: string) => {
      expect(getSvelteVersionBucket(version)).toBe('<3.0.0');
    },
  );

  it.each(['3.0.0', '3.1.0', '3.59.9', '^3.0.0', '~3.50.0'])(
    'returns "3.x" for versions >= 3.0.0 and < 4.0.0',
    (version: string) => {
      expect(getSvelteVersionBucket(version)).toBe('3.x');
    },
  );

  it.each(['4.0.0', '4.1.0', '4.99.9', '^4.0.0', '~4.50.0'])(
    'returns "4.x" for versions >= 4.0.0 and < 5.0.0',
    (version: string) => {
      expect(getSvelteVersionBucket(version)).toBe('4.x');
    },
  );

  it.each(['5.0.0', '5.1.0', '5.99.9', '^5.0.0', '~5.50.0'])(
    'returns "5.x" for versions >= 5.0.0 and < 6.0.0',
    (version: string) => {
      expect(getSvelteVersionBucket(version)).toBe('5.x');
    },
  );

  it.each(['6.0.0', '6.1.0', '10.0.0', '^6.0.0', '~10.0.0'])(
    'returns ">5.x" for versions >= 6.0.0',
    (version: string) => {
      expect(getSvelteVersionBucket(version)).toBe('>5.x');
    },
  );
});
