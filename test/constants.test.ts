import { describe, expect, it } from 'vitest';

import {
  getIntegrationDescription,
  Integration,
  mapIntegrationToPlatform,
} from '../lib/Constants';

describe('Constants', () => {
  it('exposes Apple Snapshots as a selectable integration', () => {
    expect(Object.keys(Integration)).toContain('appleSnapshots');
    expect(getIntegrationDescription(Integration.appleSnapshots)).toBe(
      'Apple Snapshots',
    );
    expect(mapIntegrationToPlatform(Integration.appleSnapshots)).toBe('iOS');
  });
});
