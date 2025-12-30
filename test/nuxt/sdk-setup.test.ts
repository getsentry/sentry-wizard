import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coerce } from 'semver';
import { addNuxtOverrides } from '../../src/nuxt/sdk-setup';
import type { PackageDotJson } from '../../src/utils/package-json';
import type { PackageManager } from '../../src/utils/package-manager';
import * as Sentry from '@sentry/node';

const {
  mockedClack,
  mockedPNPM,
  mockedAskShouldAddPackageOverride,
  mockedAskShouldInstallPackage,
  mockedInstallPackage,
  mockedHasPackageInstalled,
} = vi.hoisted(() => {
  return {
    mockedClack: {
      log: {
        warn: vi.fn(),
      },
    },
    mockedPNPM: {
      detect: vi.fn(),
    },
    mockedAskShouldAddPackageOverride: vi.fn(),
    mockedAskShouldInstallPackage: vi.fn(),
    mockedInstallPackage: vi.fn(),
    mockedHasPackageInstalled: vi.fn(),
  };
});

vi.mock(import('@clack/prompts'), async (importOriginal) => ({
  ...(await importOriginal()),
  log: {
    ...(await importOriginal()).log,
    warn: mockedClack.log.warn,
  },
}));

vi.mock('../../src/utils/clack', async (importOriginal) => ({
  ...(await importOriginal()),
  askShouldAddPackageOverride: mockedAskShouldAddPackageOverride,
  askShouldInstallPackage: mockedAskShouldInstallPackage,
  installPackage: mockedInstallPackage,
}));

vi.mock('../../src/utils/package-json', async (importOriginal) => ({
  ...(await importOriginal()),
  hasPackageInstalled: mockedHasPackageInstalled,
}));

vi.mock('../../src/utils/package-manager', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    PNPM: {
      ...original.PNPM,
      detect: mockedPNPM.detect,
    },
  };
});

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn().mockResolvedValue(undefined),
}));

describe('addNuxtOverrides', () => {
  let mockPackageManager: PackageManager;
  let mockPackageJson: PackageDotJson;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPackageManager = {
      name: 'npm',
      label: 'npm',
      installCommand: 'install',
      addOverride: vi.fn(),
      detect: vi.fn(),
      flags: '',
      forceInstallFlag: '--force',
      lockFile: 'package-lock.json',
    };

    mockPackageJson = {
      name: 'test-app',
      version: '1.0.0',
    };

    vi.spyOn(Sentry, 'setTag').mockImplementation(() => {});
  });

  describe('with Nuxt version < 3.14.0', () => {
    it('should add overrides for ofetch and @vercel/nft when user confirms', async () => {
      const nuxtMinVer = coerce('3.13.0');
      mockedPNPM.detect.mockReturnValue(false);
      mockedAskShouldAddPackageOverride.mockResolvedValue(true);

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      // Should show warning
      expect(mockedClack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('version overrides'),
      );

      // Should ask to add overrides for both packages
      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledTimes(2);
      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledWith(
        'ofetch',
        '^1.4.0',
      );
      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledWith(
        '@vercel/nft',
        '^0.27.4',
      );

      // Should add both overrides
      expect(mockPackageManager.addOverride).toHaveBeenCalledTimes(2);
      expect(mockPackageManager.addOverride).toHaveBeenCalledWith(
        'ofetch',
        '^1.4.0',
      );
      expect(mockPackageManager.addOverride).toHaveBeenCalledWith(
        '@vercel/nft',
        '^0.27.4',
      );
    });

    it('should not add overrides when user declines', async () => {
      const nuxtMinVer = coerce('3.13.0');
      mockedPNPM.detect.mockReturnValue(false);
      mockedAskShouldAddPackageOverride.mockResolvedValue(false);

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledTimes(2);
      expect(mockPackageManager.addOverride).not.toHaveBeenCalled();
    });

    it('should selectively add overrides based on user choice', async () => {
      const nuxtMinVer = coerce('3.13.0');
      mockedPNPM.detect.mockReturnValue(false);

      // Accept first, decline second
      mockedAskShouldAddPackageOverride
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledTimes(2);
      expect(mockPackageManager.addOverride).toHaveBeenCalledTimes(1);
      expect(mockPackageManager.addOverride).toHaveBeenCalledWith(
        'ofetch',
        '^1.4.0',
      );
    });
  });

  describe('with Nuxt version >= 3.14.0', () => {
    it('should not show override warning for ofetch and @vercel/nft for non-PNPM', async () => {
      const nuxtMinVer = coerce('3.14.0');
      mockedPNPM.detect.mockReturnValue(false);

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      expect(mockedClack.log.warn).not.toHaveBeenCalled();
      expect(mockedAskShouldAddPackageOverride).not.toHaveBeenCalled();
      expect(mockPackageManager.addOverride).not.toHaveBeenCalled();
    });

    it('should handle PNPM without dependency overrides', async () => {
      const nuxtMinVer = coerce('3.14.0');
      mockedPNPM.detect.mockReturnValue(true);
      mockedHasPackageInstalled.mockReturnValue(false);
      mockedAskShouldInstallPackage.mockResolvedValue(true);
      mockedInstallPackage.mockResolvedValue({
        packageManager: mockPackageManager,
      });

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      // Should still show warning for PNPM
      expect(mockedClack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('import-in-the-middle'),
      );

      // Should not ask for dependency overrides
      expect(mockedAskShouldAddPackageOverride).not.toHaveBeenCalled();

      // Should ask to install iitm
      expect(mockedAskShouldInstallPackage).toHaveBeenCalledWith(
        'import-in-the-middle',
      );
      expect(mockedInstallPackage).toHaveBeenCalledWith({
        packageName: 'import-in-the-middle',
        alreadyInstalled: false,
        packageManager: mockPackageManager,
        forceInstall: false,
      });
    });
  });

  describe('with PNPM package manager', () => {
    it('should install import-in-the-middle when not already installed and user confirms', async () => {
      const nuxtMinVer = coerce('3.13.0');
      mockedPNPM.detect.mockReturnValue(true);
      mockedAskShouldAddPackageOverride.mockResolvedValue(true);
      mockedHasPackageInstalled.mockReturnValue(false);
      mockedAskShouldInstallPackage.mockResolvedValue(true);
      mockedInstallPackage.mockResolvedValue({
        packageManager: mockPackageManager,
      });

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      // Should show warning with PNPM-specific text
      expect(mockedClack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('import-in-the-middle'),
      );

      // Should ask for dependency overrides
      expect(mockedAskShouldAddPackageOverride).toHaveBeenCalledTimes(2);

      // Should check if iitm is installed
      expect(mockedHasPackageInstalled).toHaveBeenCalledWith(
        'import-in-the-middle',
        mockPackageJson,
      );

      // Should set telemetry tag
      expect(Sentry.setTag).toHaveBeenCalledWith(
        'iitm-already-installed',
        false,
      );

      // Should ask to install iitm
      expect(mockedAskShouldInstallPackage).toHaveBeenCalledWith(
        'import-in-the-middle',
      );

      // Should install iitm
      expect(mockedInstallPackage).toHaveBeenCalledWith({
        packageName: 'import-in-the-middle',
        alreadyInstalled: false,
        packageManager: mockPackageManager,
        forceInstall: false,
      });
    });

    it('should not install import-in-the-middle when user declines', async () => {
      const nuxtMinVer = coerce('3.13.0');
      mockedPNPM.detect.mockReturnValue(true);
      mockedAskShouldAddPackageOverride.mockResolvedValue(false);
      mockedHasPackageInstalled.mockReturnValue(false);
      mockedAskShouldInstallPackage.mockResolvedValue(false);

      await addNuxtOverrides(
        mockPackageJson,
        mockPackageManager,
        nuxtMinVer,
        false,
      );

      expect(mockedAskShouldInstallPackage).toHaveBeenCalled();
      expect(mockedInstallPackage).not.toHaveBeenCalled();
    });
  });
});
