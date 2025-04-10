import { describe, expect, test } from 'vitest';
import { exists, matchesContent } from '../File';

describe('SentryCli', () => {
  test('exists', () => {
    expect(exists('**/File.ts')).toBeTruthy();
    expect(exists('Filea.ts')).toBeFalsy();
  });

  test('matchesContent', () => {
    expect(matchesContent('**/File.ts', /exists/g)).toBeTruthy();
    expect(matchesContent('**/File.ts', /blabla/g)).toBeFalsy();
    expect(matchesContent('Filea.ts', /exists/g)).toBeFalsy();
  });
});
