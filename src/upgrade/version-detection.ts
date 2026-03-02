import type {
  SentryPackageInfo,
  RemovedPackageInfo,
  VersionDetectionResult,
} from './types.js';

const REMOVED_PACKAGES: Record<string, number> = {
  '@sentry/utils': 9,
  '@sentry/types': 9,
};

function parseMajorVersion(versionRange: string): number | null {
  const match = versionRange.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectSentryVersion(pkg: PackageJson): VersionDetectionResult {
  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const packages: SentryPackageInfo[] = [];
  const hasRemovedPackages: RemovedPackageInfo[] = [];
  let maxMajor: number | null = null;

  for (const [name, version] of Object.entries(allDeps)) {
    if (!name.startsWith('@sentry/')) {
      continue;
    }

    packages.push({ name, version });

    const major = parseMajorVersion(version);
    if (major !== null && (maxMajor === null || major > maxMajor)) {
      maxMajor = major;
    }

    if (name in REMOVED_PACKAGES) {
      hasRemovedPackages.push({
        name,
        removedInVersion: REMOVED_PACKAGES[name],
      });
    }
  }

  return {
    majorVersion: maxMajor,
    packages,
    hasRemovedPackages,
  };
}

export function calculateMigrationPath(from: number, to: number): string[] {
  if (from >= to) {
    return [];
  }

  const steps: string[] = [];
  for (let v = from; v < to; v++) {
    steps.push(`v${v}-to-v${v + 1}`);
  }
  return steps;
}
