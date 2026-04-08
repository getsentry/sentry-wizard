import * as fs from 'node:fs';
import { fetchSdkVersion } from '../../../utils/release-registry';
import type { XcodeProject } from '../../xcode-manager';
import type { DiagnosticResult } from '../types';

interface SpmPackageRef {
  repositoryURL?: string;
  requirement?: { minimumVersion: string };
}

export async function checkSdkVersion({
  xcProject,
}: {
  xcProject: XcodeProject;
}): Promise<DiagnosticResult> {
  const refs = xcProject.objects.XCRemoteSwiftPackageReference ?? {};
  let currentMinVersion: string | undefined;
  let packageRefKey: string | undefined;

  for (const [key, value] of Object.entries(refs)) {
    if (key.endsWith('_comment') || typeof value === 'string') continue;
    const ref = value as SpmPackageRef;
    if (ref.repositoryURL?.includes('sentry-cocoa')) {
      currentMinVersion = ref.requirement?.minimumVersion;
      packageRefKey = key;
      break;
    }
  }

  if (!currentMinVersion) {
    return {
      name: 'SDK Version (SPM)',
      status: 'warn',
      message:
        'No Sentry SPM package reference found. SDK may be installed via CocoaPods or not installed.',
      fixAvailable: false,
    };
  }

  const latestVersion = await fetchSdkVersion('sentry.cocoa');
  if (!latestVersion) {
    return {
      name: 'SDK Version (SPM)',
      status: 'warn',
      message: `Current minimum version: ${currentMinVersion}. Could not fetch latest version to compare.`,
      fixAvailable: false,
    };
  }

  const currentMajor = parseInt(currentMinVersion.split('.')[0], 10);
  const latestMajor = parseInt(latestVersion.split('.')[0], 10);

  if (currentMajor >= latestMajor) {
    return {
      name: 'SDK Version (SPM)',
      status: 'pass',
      message: `Minimum version ${currentMinVersion} is on the latest major (${latestMajor}.x).`,
      fixAvailable: false,
    };
  }

  return {
    name: 'SDK Version (SPM)',
    status: 'fail',
    message: `Minimum version is ${currentMinVersion} but latest major is ${latestMajor}.x. Consider updating to ${latestMajor}.0.0.`,
    fixAvailable: true,
    fix: () => {
      if (packageRefKey && xcProject.objects.XCRemoteSwiftPackageReference) {
        const ref = xcProject.objects.XCRemoteSwiftPackageReference[
          packageRefKey
        ] as SpmPackageRef | string | undefined;
        if (typeof ref !== 'string' && ref?.requirement) {
          ref.requirement.minimumVersion = `${latestMajor}.0.0`;
          const newContent = xcProject.project.writeSync();
          fs.writeFileSync(xcProject.pbxprojPath, newContent);
          return Promise.resolve(true);
        }
      }
      return Promise.resolve(false);
    },
  };
}
