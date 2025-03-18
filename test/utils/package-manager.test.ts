import {
  detectPackageManger,
  NPM,
  PNPM,
  YARN_V1,
} from '../../src/utils/package-manager';

describe('detectPackageManager', () => {
  it('returns the detected package manager if exactly one is found', () => {
    const pnpm = { ...PNPM, detect: () => true };

    const packageManager = detectPackageManger([
      { ...NPM, detect: () => false },
      { ...YARN_V1, detect: () => false },
      pnpm,
    ]);

    expect(packageManager).toBe(pnpm);
  });

  it('returns null if no package manager is found', () => {
    const packageManager = detectPackageManger([
      { ...NPM, detect: () => false },
      { ...YARN_V1, detect: () => false },
    ]);
    expect(packageManager).toBeNull();
  });

  it('returns null if multiple package managers are found', () => {
    const packageManager = detectPackageManger([
      { ...NPM, detect: () => true },
      { ...YARN_V1, detect: () => true },
    ]);
    expect(packageManager).toBeNull();
  });
});
