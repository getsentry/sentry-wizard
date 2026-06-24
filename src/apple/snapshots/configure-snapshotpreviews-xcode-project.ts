import type {
  SwiftPackageProductSpec,
  SwiftPackageSpec,
  XcodeProject,
} from '../xcode-manager';
import {
  SNAPSHOTPREVIEWS_MINIMUM_VERSION,
  SNAPSHOTPREVIEWS_PACKAGE_URL,
  SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT,
  SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT,
} from './snapshotpreviews-package';

export const snapshotPreviewsPackageSpec: SwiftPackageSpec = {
  repositoryURL: SNAPSHOTPREVIEWS_PACKAGE_URL,
  requirement: {
    kind: 'upToNextMajorVersion',
    minimumVersion: SNAPSHOTPREVIEWS_MINIMUM_VERSION,
  },
  commentName: 'SnapshotPreviews',
};

export const snapshottingTestsProductSpec: SwiftPackageProductSpec = {
  package: snapshotPreviewsPackageSpec,
  productName: SNAPSHOTPREVIEWS_SNAPSHOT_TESTS_PRODUCT,
};

export const snapshotPreferencesProductSpec: SwiftPackageProductSpec = {
  package: snapshotPreviewsPackageSpec,
  productName: SNAPSHOTPREVIEWS_PREFERENCES_PRODUCT,
};

export function configureSnapshotPreviewsXcodeProject({
  xcodeProject,
  hostedTestTargetName,
  previewTargetNames = [],
}: {
  xcodeProject: XcodeProject;
  hostedTestTargetName: string;
  previewTargetNames?: string[];
}): { changed: boolean; linked: boolean } {
  if (!xcodeProject.getUnitTestTargetNames().includes(hostedTestTargetName)) {
    return { changed: false, linked: false };
  }

  const linkResults = [
    xcodeProject.ensureSwiftPackageProductLinked(
      hostedTestTargetName,
      snapshottingTestsProductSpec,
    ),
    ...previewTargetNames.map((previewTargetName) =>
      xcodeProject.ensureSwiftPackageProductLinked(
        previewTargetName,
        snapshotPreferencesProductSpec,
      ),
    ),
  ];

  return {
    changed: linkResults.some((result) => result.changed),
    linked: linkResults.every((result) => result.linked),
  };
}
