import * as fs from 'node:fs';
import * as path from 'node:path';

import type { XcodeProject } from '../xcode-manager';

const SNAPSHOT_TEST_IMPORT = 'import SnapshottingTests';
const SNAPSHOT_TEST_SUPERCLASS = ': SnapshotTest';

export function ensureSnapshotTestFile({
  xcodeProject,
  hostedTestTargetName,
}: {
  xcodeProject: XcodeProject;
  hostedTestTargetName: string;
}): { changed: boolean; included: boolean; filePath?: string } {
  const existingSnapshotTestFile = findExistingSnapshotTestFile(
    xcodeProject,
    hostedTestTargetName,
  );
  if (existingSnapshotTestFile) {
    return {
      changed: false,
      included: true,
      filePath: existingSnapshotTestFile,
    };
  }

  const className = snapshotTestClassName(hostedTestTargetName);
  const filePath = path.join(
    getSnapshotTestDirectory(xcodeProject, hostedTestTargetName),
    `${className}.swift`,
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fileCreated = !fs.existsSync(filePath);
  if (fileCreated) {
    fs.writeFileSync(filePath, snapshotTestTemplate(className), 'utf8');
  }

  const membership = xcodeProject.addSwiftSourceFileToTarget({
    targetName: hostedTestTargetName,
    filePath,
  });

  if (!membership.included) {
    if (fileCreated) {
      fs.unlinkSync(filePath);
    }

    return { changed: false, included: false };
  }

  return {
    changed: fileCreated || membership.changed,
    included: true,
    filePath,
  };
}

export function snapshotTestClassName(hostedTestTargetName: string): string {
  return `${swiftSafeTypeName(hostedTestTargetName)}SnapshotTest`;
}

export function snapshotTestTemplate(className: string): string {
  return `${SNAPSHOT_TEST_IMPORT}

final class ${className}: SnapshotTest {
  override class func snapshotPreviews() -> [String]? { nil }
  override class func excludedSnapshotPreviews() -> [String]? { nil }
  override class func snapshotPreviewModules() -> [String]? { nil }
  override class func excludedSnapshotPreviewModules() -> [String]? { nil }
}
`;
}

export function swiftSafeTypeName(value: string): string {
  const words = value.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
  const typeName = words
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('');

  if (!typeName) {
    return 'Snapshots';
  }

  return /^[0-9]/.test(typeName) ? `_${typeName}` : typeName;
}

function findExistingSnapshotTestFile(
  xcodeProject: XcodeProject,
  hostedTestTargetName: string,
): string | undefined {
  const sourceFiles =
    xcodeProject.getSourceFilesForTarget(hostedTestTargetName);
  return sourceFiles?.find((filePath) => {
    if (!filePath.endsWith('.swift') || !fs.existsSync(filePath)) {
      return false;
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    return (
      contents.includes(SNAPSHOT_TEST_IMPORT) &&
      contents.includes(SNAPSHOT_TEST_SUPERCLASS)
    );
  });
}

function getSnapshotTestDirectory(
  xcodeProject: XcodeProject,
  hostedTestTargetName: string,
): string {
  const synchronizedRootGroupPath =
    xcodeProject.getSynchronizedRootGroupPathsForTarget(
      hostedTestTargetName,
    )[0];
  if (synchronizedRootGroupPath) {
    return synchronizedRootGroupPath;
  }

  const existingSwiftFile = xcodeProject
    .getSourceFilesForTarget(hostedTestTargetName)
    ?.find((filePath) => filePath.endsWith('.swift'));
  if (existingSwiftFile) {
    return path.dirname(existingSwiftFile);
  }

  return path.join(xcodeProject.baseDir, hostedTestTargetName);
}
