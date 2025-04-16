/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debug } from '../utils/debug';
import type { SentryProjectData } from '../utils/types';
import * as templates from './templates';

import {
  project as createXcodeProject,
  PBXFileReference,
  PBXFileSystemSynchronizedBuildFileExceptionSet,
  PBXSourcesBuildPhase,
  type PBXBuildFile,
  type PBXFileSystemSynchronizedRootGroup,
  type PBXGroup,
  type PBXNativeTarget,
  type PBXObjects,
  type Project,
  type XCConfigurationList,
} from 'xcode';
import { MacOSSystemHelpers } from './macos-system-helper';
import { XcodeProjectObjectWithId } from './XcodeProjectObjectWithId';

interface ProjectFile {
  key?: string;
  name: string;
  path: string;
}

function setDebugInformationFormatAndSandbox(
  proj: Project,
  targetName: string,
): void {
  const xcObjects = proj.hash.project.objects;
  if (!xcObjects.PBXNativeTarget) {
    xcObjects.PBXNativeTarget = {};
  }
  const targetKey: string = Object.keys(xcObjects.PBXNativeTarget).filter(
    (key) => {
      const value = xcObjects.PBXNativeTarget?.[key];
      return (
        !key.endsWith('_comment') &&
        typeof value !== 'string' &&
        value?.name === targetName
      );
    },
  )[0];
  const target = xcObjects.PBXNativeTarget[targetKey] as
    | PBXNativeTarget
    | undefined;

  if (!xcObjects.XCBuildConfiguration) {
    xcObjects.XCBuildConfiguration = {};
  }
  if (!xcObjects.XCConfigurationList) {
    xcObjects.XCConfigurationList = {};
  }
  const buildConfigurationListId = target?.buildConfigurationList ?? '';
  const configurationList = xcObjects.XCConfigurationList?.[
    buildConfigurationListId
  ] as XCConfigurationList | undefined;
  const buildListConfigurationIds =
    configurationList?.buildConfigurations ?? [];
  for (const buildListConfigId of buildListConfigurationIds) {
    const config =
      xcObjects.XCBuildConfiguration[buildListConfigId.value] ?? {};
    if (typeof config === 'string') {
      // Ignore comments
      continue;
    }

    const buildSettings = config.buildSettings ?? {};
    buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
    buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = '"NO"';

    config.buildSettings = buildSettings;
    xcObjects.XCBuildConfiguration[buildListConfigId.value] = config;
  }
}

function addSentrySPM(proj: Project, targetName: string): void {
  const xcObjects = proj.hash.project.objects;

  const sentryFrameworkUUID = proj.generateUuid();
  const sentrySPMUUID = proj.generateUuid();

  // Check whether xcObjects already have sentry framework
  if (xcObjects.PBXFrameworksBuildPhase) {
    for (const key in xcObjects.PBXFrameworksBuildPhase || {}) {
      const frameworkBuildPhase = xcObjects.PBXFrameworksBuildPhase[key];
      if (key.endsWith('_comment') || typeof frameworkBuildPhase === 'string') {
        // Ignore comments
        continue;
      }
      for (const framework of frameworkBuildPhase.files ?? []) {
        // We identify the Sentry framework by the comment "Sentry in Frameworks",
        // which is set by this manager in previous runs.
        if (framework.comment === 'Sentry in Frameworks') {
          return;
        }
      }
    }
  }

  if (!xcObjects.PBXBuildFile) {
    xcObjects.PBXBuildFile = {};
  }
  xcObjects.PBXBuildFile[sentryFrameworkUUID] = {
    isa: 'PBXBuildFile',
    productRef: sentrySPMUUID,
    productRef_comment: 'Sentry',
  };
  xcObjects.PBXBuildFile[`${sentryFrameworkUUID}_comment`] =
    'Sentry in Frameworks';

  if (!xcObjects.PBXFrameworksBuildPhase) {
    xcObjects.PBXFrameworksBuildPhase = {};
  }
  for (const key in xcObjects.PBXFrameworksBuildPhase) {
    const value = xcObjects.PBXFrameworksBuildPhase[key];
    if (key.endsWith('_comment') || typeof value === 'string') {
      // Ignore comments
      continue;
    }

    const frameworks = value.files ?? [];
    frameworks.push({
      value: sentryFrameworkUUID,
      comment: 'Sentry in Frameworks',
    });
    value.files = frameworks;

    xcObjects.PBXFrameworksBuildPhase[key] = value;
  }

  if (!xcObjects.PBXNativeTarget) {
    xcObjects.PBXNativeTarget = {};
  }
  const targetKey = Object.keys(xcObjects.PBXNativeTarget || {}).filter(
    (key) => {
      const value = xcObjects.PBXNativeTarget?.[key];
      return (
        !key.endsWith('_comment') &&
        typeof value !== 'string' &&
        value?.name === targetName
      );
    },
  )[0];
  const target = xcObjects.PBXNativeTarget[targetKey] as PBXNativeTarget;

  if (!target.packageProductDependencies) {
    target.packageProductDependencies = [];
  }
  target.packageProductDependencies.push({
    value: sentrySPMUUID,
    comment: 'Sentry',
  });

  const sentrySwiftPackageUUID = proj.generateUuid();
  const xcProject = proj.getFirstProject().firstProject;
  if (!xcProject.packageReferences) {
    xcProject.packageReferences = [];
  }
  xcProject.packageReferences.push({
    value: sentrySwiftPackageUUID,
    comment: 'XCRemoteSwiftPackageReference "sentry-cocoa"',
  });

  if (!xcObjects.XCRemoteSwiftPackageReference) {
    xcObjects.XCRemoteSwiftPackageReference = {};
  }

  xcObjects.XCRemoteSwiftPackageReference[sentrySwiftPackageUUID] = {
    isa: 'XCRemoteSwiftPackageReference',
    repositoryURL: '"https://github.com/getsentry/sentry-cocoa/"',
    requirement: {
      kind: 'upToNextMajorVersion',
      minimumVersion: '8.0.0',
    },
  };
  xcObjects.XCRemoteSwiftPackageReference[`${sentrySwiftPackageUUID}_comment`] =
    'XCRemoteSwiftPackageReference "sentry-cocoa"';

  if (!xcObjects.XCSwiftPackageProductDependency) {
    xcObjects.XCSwiftPackageProductDependency = {};
  }
  xcObjects.XCSwiftPackageProductDependency[sentrySPMUUID] = {
    isa: 'XCSwiftPackageProductDependency',
    package: sentrySwiftPackageUUID,
    package_comment: 'XCRemoteSwiftPackageReference "sentry-cocoa"',
    productName: 'Sentry',
  };
  xcObjects.XCSwiftPackageProductDependency[`${sentrySPMUUID}_comment`] =
    'Sentry';

  clack.log.step('Added Sentry SPM dependency to your project');
}

function addUploadSymbolsScript(
  xcodeProject: Project,
  sentryProject: SentryProjectData,
  targetName: string,
  uploadSource: boolean,
): void {
  const xcObjects = xcodeProject.hash.project.objects;
  if (!xcObjects.PBXNativeTarget) {
    xcObjects.PBXNativeTarget = {};
  }
  const targetKey = Object.keys(xcObjects.PBXNativeTarget).filter((key) => {
    const value = xcObjects.PBXNativeTarget?.[key];
    return (
      !key.endsWith('_comment') &&
      typeof value !== 'string' &&
      value?.name === targetName
    );
  })[0];

  if (!xcObjects.PBXShellScriptBuildPhase) {
    xcObjects.PBXShellScriptBuildPhase = {};
  }
  for (const key in xcObjects.PBXShellScriptBuildPhase) {
    const value = xcObjects.PBXShellScriptBuildPhase[key] ?? {};
    if (typeof value === 'string') {
      // Ignore comments
      continue;
    }

    // Sentry script already exists, update it
    if (value.shellScript?.includes('sentry-cli')) {
      delete xcObjects.PBXShellScriptBuildPhase?.[key];
      delete xcObjects.PBXShellScriptBuildPhase?.[`${key}_comment`];
      break;
    }
    xcObjects.PBXShellScriptBuildPhase[key] = value;
  }

  // Add the build phase to the target
  const isHomebrewInstalled = fs.existsSync('/opt/homebrew/bin/sentry-cli');
  xcodeProject.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    'Upload Debug Symbols to Sentry',
    targetKey,
    {
      inputFileListPaths: [],
      outputFileListPaths: [],
      inputPaths: [templates.scriptInputPath],
      shellPath: '/bin/sh',
      shellScript: templates.getRunScriptTemplate(
        sentryProject.organization.slug,
        sentryProject.slug,
        uploadSource,
        isHomebrewInstalled,
      ),
    },
  );
  clack.log.step(`Added Sentry upload script to "${targetName}" build phase`);
}

export class XcodeProject {
  /**
   * The directory where the Xcode project is located.
   */
  baseDir: string;

  /**
   * The path to the `<PROJECT>.xcodeproj` directory.
   */
  xcodeprojPath: string;

  /**
   * The path to the `project.pbxproj` file.
   */
  pbxprojPath: string;

  /**
   * The Xcode project object.
   */
  project: Project;

  objects: PBXObjects;

  /**
   * Creates a new XcodeProject instance, a wrapper around the Xcode project file `<PROJECT>.xcodeproj/project.pbxproj`.
   *
   * @param projectPath - The path to the Xcode project file
   */
  public constructor(projectPath: string) {
    this.pbxprojPath = projectPath;
    this.xcodeprojPath = path.dirname(projectPath);
    this.baseDir = path.dirname(this.xcodeprojPath);

    this.project = createXcodeProject(projectPath);
    this.project.parseSync();
    this.objects = this.project.hash.project.objects;
  }

  public getAllTargets(): string[] {
    const targets = this.objects.PBXNativeTarget ?? {};
    return Object.keys(targets)
      .filter((key) => {
        const value = targets[key];
        return (
          !key.endsWith('_comment') &&
          typeof value !== 'string' &&
          value.productType.startsWith('"com.apple.product-type.application')
        );
      })
      .map((key) => {
        return (targets[key] as PBXNativeTarget).name;
      });
  }

  public updateXcodeProject(
    sentryProject: SentryProjectData,
    target: string,
    addSPMReference: boolean,
    uploadSource = true,
  ): void {
    addUploadSymbolsScript(this.project, sentryProject, target, uploadSource);
    if (uploadSource) {
      setDebugInformationFormatAndSandbox(this.project, target);
    }
    if (addSPMReference) {
      addSentrySPM(this.project, target);
    }
    const newContent = this.project.writeSync();
    fs.writeFileSync(this.pbxprojPath, newContent);
  }

  /**
   * Retrieves all source files associated with a specific target in the Xcode project.
   * This is used to find files where we can inject Sentry initialization code.
   *
   * @param targetName - The name of the target to get files for
   * @returns An array of absolute file paths for the target's source files, or undefined if target not found
   */
  public getSourceFilesForTarget(targetName: string): string[] | undefined {
    // ## Summary how Xcode Projects are structured:
    // - Every Xcode Project has exactly one main group of type `PBXGroup`
    // - The main group contains a list of children identifiers
    // - Each child can be a `PBXGroup`, a `PBXFileReference` or a `PBXFileSystemSynchronizedRootGroup`
    // - Each `PBXGroup` has a list of children identifiers which again can be `PBXGroup`, `PBXFileReference` or `PBXFileSystemSynchronizedRootGroup`
    // - The target defines the list of `fileSystemSynchronizedGroups` which are `PBXFileSystemSynchronizedRootGroup` to be included in the build phase
    // - The `PBXFileSystemSynchronizedRootGroup` has a list of `exceptions` which are `PBXFileSystemSynchronizedBuildFileExceptionSet`
    // - Each `PBXFileSystemSynchronizedBuildFileExceptionSet` represents a folder to be excluded from the build.
    // - The `PBXFileSystemSynchronizedBuildFileExceptionSet` has a list of `membershipExceptions` which are files to be excluded from being excluded, therefore included in the build.
    // - The Xcode project has a build phase `PBXSourcesBuildPhase` which has a list of `files` which are `PBXBuildFile`
    // - A file which is not part of a `PBXFileSystemSynchronizedRootGroup` must be added to the `files` list of the `PBXSourcesBuildPhase` build phase
    // - Nested subfolders in `fileSystemSynchronizedGroups` are not declared but recursively included
    //
    // Based on the findings above the files included in the build phase are:
    // - All files in the `files` of the `PBXSourcesBuildPhase` build phase `Sources` of the target
    // - All files in directories of the `fileSystemSynchronizedGroups` of the target
    // - Excluding all files in the `exceptions` of the `PBXFileSystemSynchronizedRootGroup` of the target
    // - Including all files in the `membershipExceptions` of the `PBXFileSystemSynchronizedBuildFileExceptionSet` of the target
    const nativeTarget = this.findNativeTargetByName(targetName);
    if (!nativeTarget) {
      debug('Target not found: ' + targetName);
      return undefined;
    }

    const filesInBuildPhase = this.findFilesInSourceBuildPhase(nativeTarget);
    debug(
      `Found ${filesInBuildPhase.length} files in build phase for target: ${targetName}`,
    );

    const filesInSynchronizedRootGroups =
      this.findFilesInSynchronizedRootGroups(nativeTarget);
    debug(
      `Found ${filesInSynchronizedRootGroups.length} files in synchronized root groups for target: ${targetName}`,
    );
    return [...filesInBuildPhase, ...filesInSynchronizedRootGroups];
  }

  // ================================ TARGET HELPERS ================================

  /**
   * Finds a native target by name.
   *
   * @param targetName - The name of the target to find
   * @returns The native target, or undefined if the target is not found
   */
  private findNativeTargetByName(
    targetName: string,
  ): XcodeProjectObjectWithId<PBXNativeTarget> | undefined {
    debug('Finding native target by name: ' + targetName);

    if (!this.objects.PBXNativeTarget) {
      debug('No native targets found');
      return undefined;
    }

    const nativeTargets = Object.entries(this.objects.PBXNativeTarget);
    for (const [key, target] of nativeTargets) {
      // Ignore comments
      if (key.endsWith('_comment') || typeof target === 'string') {
        continue;
      }

      // Ignore targets that are not the target we are looking for
      if (target.name !== targetName) {
        continue;
      }
      debug('Found native target: ' + targetName);
      return {
        id: key,
        obj: target,
      };
    }

    debug('Target not found: ' + targetName);
    return undefined;
  }

  // ================================ BUILD PHASE HELPERS ================================

  /**
   * Finds the source build phase in a target.
   *
   * @param target - The target to find the source build phase in
   * @returns The source build phase, or undefined if the target is not found or has no source build phase
   */
  findSourceBuildPhaseInTarget(
    target: PBXNativeTarget,
  ): XcodeProjectObjectWithId<PBXSourcesBuildPhase> | undefined {
    debug(`Finding source build phase in target: ${target.name}`);
    if (!target.buildPhases) {
      debug('No build phases found for target: ' + target.name);
      return undefined;
    }
    for (const phase of target.buildPhases) {
      const buildPhaseId = phase.value;
      const buildPhase = this.objects.PBXSourcesBuildPhase?.[buildPhaseId];
      if (typeof buildPhase !== 'object') {
        // Ignore comments
        continue;
      }
      debug(
        `Found source build phase: ${buildPhaseId} for target: ${target.name}`,
      );
      return {
        id: buildPhaseId,
        obj: buildPhase,
      };
    }

    debug(`No source build phase found for target: ${target.name}`);
    return undefined;
  }

  // ================================ FILE HELPERS ================================

  /**
   * Finds all files in the source build phase of a target.
   *
   * @param nativeTarget - The target to find the files in
   * @returns The files in the source build phase of the target, or an empty array if the target is not found or has no source build phase
   */
  findFilesInSourceBuildPhase(
    nativeTarget: XcodeProjectObjectWithId<PBXNativeTarget>,
  ): string[] {
    debug(
      'Finding files in source build phase for target: ' +
        nativeTarget.obj.name,
    );
    const buildPhase = this.findSourceBuildPhaseInTarget(nativeTarget.obj);
    if (!buildPhase) {
      debug(
        `Sources build phase not found for target: ${nativeTarget.obj.name}`,
      );
      return [];
    }
    const buildPhaseFiles = buildPhase.obj.files;
    if (!buildPhaseFiles) {
      debug(
        `No files found in sources build phase for target: ${nativeTarget.obj.name}`,
      );
      return [];
    }
    if (!this.objects.PBXBuildFile) {
      debug('PBXBuildFile is undefined');
      return [];
    }
    if (!this.objects.PBXFileReference) {
      debug('PBXFileReference is undefined');
      return [];
    }

    const result: string[] = [];
    for (const file of buildPhaseFiles) {
      debug(`Resolving build phase file: ${file.value}`);
      // Find the related build file object
      const buildFileObj = this.objects.PBXBuildFile[
        file.value
      ] as PBXBuildFile;
      if (!buildFileObj || typeof buildFileObj !== 'object') {
        debug(`Build file object not found for file: ${file.value}`);
        continue;
      }
      debug(`Build file object found for file: ${file.value}`);

      const buildFileRefId = buildFileObj.fileRef;
      if (!buildFileRefId) {
        debug(`File reference not found for file: ${file.value}`);
        continue;
      }
      debug(`Build file reference found for file: ${file.value}`);

      // Find the related file reference object
      const buildFile = this.objects.PBXFileReference[buildFileRefId];
      if (!buildFile || typeof buildFile !== 'object') {
        debug(`File not found in file dictionary for file: ${file.value}`);
        continue;
      }
      debug(`Build file found in file dictionary for file: ${file.value}`);

      // Resolve the path of the file based on the `sourceTree` property
      const resolvedFilePath = this.resolveAbsolutePathOfFileReference({
        id: buildFileRefId,
        obj: buildFile,
      });
      if (!resolvedFilePath) {
        debug(`Failed to resolve file path for file: ${file.value}`);
        continue;
      }
      debug(`Resolved file ${file.value} to path: ${resolvedFilePath}`);

      result.push(resolvedFilePath);
    }

    debug(
      `Resolved ${result.length} files for target: ${nativeTarget.obj.name}`,
    );
    return result;
  }

  /**
   * Resolves the absolute path of a file reference.
   *
   * @param fileRef - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsolutePathOfFileReference(
    fileRef: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    debug(
      `Resolving path of file reference: ${fileRef.id} with path: ${fileRef.obj.path}`,
    );
    // File path is expected to be set, therefore typing is non-nullable.
    // As the file is loaded from a project file, it is not guaranteed to be set,
    // therefore we treat it as optional.
    if (!fileRef.obj.path) {
      debug(`File reference path not found for file reference: ${fileRef.id}`);
      return undefined;
    }

    // File references are resolved based on the `sourceTree` property
    // which can have one of the following values:
    // - '<absolute>': The file path is absolute
    // - '<group>': The file path is relative to the parent group of the file reference
    // - 'BUILT_PRODUCTS_DIR': The file path is relative to the built products directory, i.e. the build output directory in derived data
    // - 'SOURCE_ROOT': The file path is relative to the source root, i.e. the directory where the Xcode project is located
    // - 'SDKROOT': The file path is relative to the SDK root, i.e. the directory where the SDK is installed
    // - 'DEVELOPER_DIR': The file path is relative to the developer directory, i.e. the directory where the Xcode command line tools are installed

    // The default is '<group>'
    const fileRefSourceTree = fileRef.obj.sourceTree?.replace(/"/g, '') ?? '';
    switch (fileRefSourceTree) {
      case '<absolute>':
        return fileRef.obj.path.replace(/"/g, '');
      case '<group>':
        return this.resolveAbsoluteFilePathRelativeToGroup(fileRef);
      case 'BUILT_PRODUCTS_DIR':
        return this.resolveAbsoluteFilePathRelativeToBuiltProductsDir(fileRef);
      case 'SOURCE_ROOT':
        return this.resolveAbsoluteFilePathRelativeToSourceRoot(fileRef);
      case 'SDKROOT':
        return this.resolveAbsoluteFilePathRelativeToSdkRoot(fileRef);
      case 'DEVELOPER_DIR':
        return this.resolveAbsoluteFilePathRelativeToDeveloperDir(fileRef);
      default:
        debug(
          `Unknown source tree '${fileRef.obj.sourceTree}' for build file: ${fileRef.obj.path}`,
        );
        return undefined;
    }
  }

  /**
   * Resolves the absolute path of a file reference relative to the parent group.
   *
   * @param fileRef - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsoluteFilePathRelativeToGroup(
    fileRef: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    debug(
      `Resolving absolute file path relative to group for file reference: ${
        fileRef.id
      } with path: ${fileRef.obj.path ?? ''}`,
    );
    const fileRefPath = fileRef.obj.path?.replace(/"/g, '');
    if (!fileRefPath) {
      debug(`File reference path not found for file reference: ${fileRef.id}`);
      return undefined;
    }

    // Find the parent group of the file reference by searching for the reverse relationship
    const parentGroup = this.findParentGroupByChildId(fileRef.id);
    if (!parentGroup) {
      debug(
        `Parent group not found for file reference: ${fileRef.id} at path: ${fileRefPath}`,
      );
      return undefined;
    }

    // Resolve the path of the parent group
    const absoluteGroupPath = this.resolveAbsolutePathOfGroup(parentGroup);
    if (!absoluteGroupPath) {
      debug(`Failed to resolve path of group: ${parentGroup.id}`);
      return undefined;
    }

    return path.join(absoluteGroupPath, fileRefPath);
  }

  /**
   * Resolves the absolute path of a file reference relative to the built products directory.
   *
   * @param buildFile - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsoluteFilePathRelativeToBuiltProductsDir(
    buildFile: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    debug(
      `Resolving absolute file path relative to built products directory for file reference: ${
        buildFile.id
      } with path: ${buildFile.obj.path ?? ''}`,
    );
    const builtProductsDir = this.getBuildProductsDirectoryPath();
    if (!builtProductsDir) {
      debug(`Failed to resolve built products directory path`);
      return undefined;
    }

    return path.join(builtProductsDir, buildFile.obj.path.replace(/"/g, ''));
  }

  /**
   * Resolves the absolute path of a file reference relative to the source root.
   *
   * The source root is the directory where the `.xcodeproj` file is located.
   *
   * @param buildFile - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsoluteFilePathRelativeToSourceRoot(
    buildFile: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    return path.join(this.baseDir, buildFile.obj.path.replace(/"/g, ''));
  }

  /**
   * Resolves the absolute path of a file reference relative to the SDK root.
   *
   * @param buildFile - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsoluteFilePathRelativeToSdkRoot(
    buildFile: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    debug(
      `Resolving absolute file path relative to SDK root for file reference: ${
        buildFile.id
      } with path: ${buildFile.obj.path ?? ''}`,
    );

    const sdkRoot = MacOSSystemHelpers.findSDKRootDirectoryPath();
    if (!sdkRoot) {
      debug(`Failed to resolve SDK root directory path`);
      return undefined;
    }

    return path.join(sdkRoot, buildFile.obj.path.replace(/"/g, ''));
  }

  /**
   * Resolves the absolute path of a file reference relative to the developer directory.
   *
   * @param buildFile - The file reference to resolve the path of
   * @returns The absolute path of the file reference, or undefined if the file reference is not found or has no path
   */
  private resolveAbsoluteFilePathRelativeToDeveloperDir(
    buildFile: XcodeProjectObjectWithId<PBXFileReference>,
  ): string | undefined {
    debug(
      `Resolving absolute file path relative to developer directory for file reference: ${
        buildFile.id
      } with path: ${buildFile.obj.path ?? ''}`,
    );
    const developerDir = MacOSSystemHelpers.findDeveloperDirectoryPath();
    if (!developerDir) {
      debug(`Failed to resolve developer directory path`);
      return undefined;
    }

    return path.join(developerDir, buildFile.obj.path.replace(/"/g, ''));
  }

  /**
   * Resolves the absolute path of a group.
   *
   * @param group - The group to resolve the path of
   * @returns The absolute path of the group, or undefined if the group is not found or has no path
   */
  private resolveAbsolutePathOfGroup(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    debug(
      `Resolving path of group: ${group.id} with path: ${group.obj.path ?? ''}`,
    );

    // Group paths are resolved based on the `sourceTree` property
    // which can have one of the following values:
    // - '<group>': The group path is relative to the parent group of the group
    // - 'SOURCE_ROOT': The group path is relative to the source root, i.e. the directory where the Xcode project is located
    // - 'BUILT_PRODUCTS_DIR': The group path is relative to the built products directory, i.e. the build output directory in derived data
    // - 'SDKROOT': The group path is relative to the SDK root, i.e. the directory where the SDK is installed
    // - 'DEVELOPER_DIR': The group path is relative to the developer directory, i.e. the directory where the Xcode command line tools are installed

    // The default is '<group>'
    const groupSourceTree =
      group.obj.sourceTree?.replace(/"/g, '') ?? '<group>';

    switch (groupSourceTree) {
      case '<group>':
        return this.resolvePathOfGroupRelativeToGroup(group);
      case 'SOURCE_ROOT':
        return this.resolvePathOfGroupRelativeToSourceRoot(group);
      case 'BUILT_PRODUCTS_DIR':
        return this.resolvePathOfGroupRelativeToBuiltProductsDir(group);
      case 'SDKROOT':
        return this.resolvePathOfGroupRelativeToSdkRoot(group);
      case 'DEVELOPER_DIR':
        return this.resolvePathOfGroupRelativeToDeveloperDir(group);
      default:
        debug(
          `Unknown source tree '${groupSourceTree}' for group: ${group.id}`,
        );
        return undefined;
    }
  }

  /**
   * Resolves the path of a group relative to the parent group.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the parent group, or undefined if the group is not found or has no path
   */
  private resolvePathOfGroupRelativeToGroup(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    const parentGroup = this.findParentGroupByChildId(group.id);

    if (!parentGroup) {
      debug(`Parent group not found for group: ${group.id}`);
      // If the parent group is not found, check if the group is the main group
      // We assume the main group is at the root of the project
      if (this.isMainGroup(group.id)) {
        return this.baseDir;
      }
      return undefined;
    }

    const parentGroupPath = this.resolveAbsolutePathOfGroup(parentGroup);
    if (!parentGroupPath) {
      debug(`Failed to resolve path of parent group: ${parentGroup.id}`);
      return undefined;
    }

    const groupPath = group.obj.path?.replace(/"/g, '') ?? '';
    if (!groupPath) {
      debug(`Group path not found for group: ${group.id}`);
      return undefined;
    }

    return path.join(parentGroupPath, groupPath);
  }

  /**
   * Resolves the path of a group relative to the source root.
   *
   * The source root is the directory where the `.xcodeproj` file is located.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the source root, or undefined if the group is not found or has no path
   */
  private resolvePathOfGroupRelativeToSourceRoot(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    const groupPath = group.obj.path?.replace(/"/g, '') ?? '';
    if (!groupPath) {
      debug(`Group path not found for group: ${group.id}`);
      return this.baseDir;
    }
    return path.join(this.baseDir, groupPath);
  }

  /**
   * Resolves the path of a group relative to the built products directory.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the built products directory, or undefined if the group is not found or has no path
   */
  private resolvePathOfGroupRelativeToBuiltProductsDir(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    debug(
      `Resolving path of group: ${group.id} relative to built products directory`,
    );
    const builtProductsDir = this.getBuildProductsDirectoryPath();
    if (!builtProductsDir) {
      debug(`Failed to resolve built products directory path`);
      return undefined;
    }

    return path.join(builtProductsDir, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Resolves the path of a group relative to the SDK root.
   *
   * The SDK root is the directory where the SDK is installed.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the SDK root, or undefined if the group is not found or has no path
   */
  private resolvePathOfGroupRelativeToSdkRoot(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    debug(`Resolving path of group: ${group.id} relative to SDK root`);
    const sdkRoot = MacOSSystemHelpers.findSDKRootDirectoryPath();
    if (!sdkRoot) {
      debug(`Failed to resolve SDK root directory path`);
      return undefined;
    }

    return path.join(sdkRoot, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Resolves the path of a group relative to the developer directory.
   *
   * The developer directory is the directory where the Xcode command line tools are installed.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the developer directory, or undefined if the group is not found or has no path
   */
  private resolvePathOfGroupRelativeToDeveloperDir(
    group: XcodeProjectObjectWithId<PBXGroup>,
  ): string | undefined {
    debug(
      `Resolving path of group: ${group.id} relative to developer directory`,
    );
    const developerDir = MacOSSystemHelpers.findDeveloperDirectoryPath();
    if (!developerDir) {
      debug(`Failed to resolve developer directory path`);
      return undefined;
    }

    return path.join(developerDir, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Resolves the absolute path of a group.
   *
   * @param group - The group to resolve the path of
   * @returns The absolute path of the group, or undefined if the group is not found or has no path
   */
  private resolveAbsolutePathOfSynchronizedRootGroup(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    debug(
      `Resolving path of synchronized root group: ${group.id} with path: ${
        group.obj.path ?? ''
      }`,
    );

    // Group paths are resolved based on the `sourceTree` property
    // which can have one of the following values:
    // - '<group>': The group path is relative to the parent group of the group
    // - 'SOURCE_ROOT': The group path is relative to the source root, i.e. the directory where the Xcode project is located
    // - 'BUILT_PRODUCTS_DIR': The group path is relative to the built products directory, i.e. the build output directory in derived data
    // - 'SDKROOT': The group path is relative to the SDK root, i.e. the directory where the SDK is installed
    // - 'DEVELOPER_DIR': The group path is relative to the developer directory, i.e. the directory where the Xcode command line tools are installed

    // The default is '<group>'
    const groupSourceTree =
      group.obj.sourceTree?.replace(/"/g, '') ?? '<group>';

    switch (groupSourceTree) {
      case '<group>':
        return this.resolvePathOfSynchronizedRootGroupRelativeToGroup(group);
      case 'SOURCE_ROOT':
        return this.resolvePathOfSynchronizedRootGroupRelativeToSourceRoot(
          group,
        );
      case 'BUILT_PRODUCTS_DIR':
        return this.resolvePathOfSynchronizedRootGroupRelativeToBuiltProductsDir(
          group,
        );
      case 'SDKROOT':
        return this.resolvePathOfSynchronizedRootGroupRelativeToSdkRoot(group);
      case 'DEVELOPER_DIR':
        return this.resolvePathOfSynchronizedRootGroupRelativeToDeveloperDir(
          group,
        );
      default:
        debug(
          `Unknown source tree '${groupSourceTree}' for group: ${group.id}`,
        );
        return undefined;
    }
  }

  /**
   * Resolves the path of a group relative to the parent group.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the parent group, or undefined if the group is not found or has no path
   */
  private resolvePathOfSynchronizedRootGroupRelativeToGroup(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    const parentGroup = this.findParentGroupByChildId(group.id);

    if (!parentGroup) {
      debug(`Parent group not found for group: ${group.id}`);
      // If the parent group is not found, check if the group is the main group
      // We assume the main group is at the root of the project
      if (this.isMainGroup(group.id)) {
        return this.baseDir;
      }
      return undefined;
    }

    const parentGroupPath = this.resolveAbsolutePathOfGroup(parentGroup);
    if (!parentGroupPath) {
      debug(`Failed to resolve path of parent group: ${parentGroup.id}`);
      return undefined;
    }

    const groupPath = group.obj.path?.replace(/"/g, '') ?? '';
    if (!groupPath) {
      debug(`Group path not found for group: ${group.id}`);
      return undefined;
    }

    return path.join(parentGroupPath, groupPath);
  }

  /**
   * Resolves the path of a group relative to the source root.
   *
   * The source root is the directory where the `.xcodeproj` file is located.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the source root, or undefined if the group is not found or has no path
   */
  private resolvePathOfSynchronizedRootGroupRelativeToSourceRoot(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    const groupPath = group.obj.path?.replace(/"/g, '') ?? '';
    if (!groupPath) {
      debug(`Group path not found for group: ${group.id}`);
      return this.baseDir;
    }
    return path.join(this.baseDir, groupPath);
  }

  /**
   * Resolves the path of a group relative to the built products directory.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the built products directory, or undefined if the group is not found or has no path
   */
  private resolvePathOfSynchronizedRootGroupRelativeToBuiltProductsDir(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    debug(
      `Resolving path of synchronized root group: ${group.id} relative to built products directory`,
    );
    const builtProductsDir = this.getBuildProductsDirectoryPath();
    if (!builtProductsDir) {
      debug(`Failed to resolve built products directory path`);
      return undefined;
    }

    return path.join(builtProductsDir, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Resolves the path of a group relative to the SDK root.
   *
   * The SDK root is the directory where the SDK is installed.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the SDK root, or undefined if the group is not found or has no path
   */
  private resolvePathOfSynchronizedRootGroupRelativeToSdkRoot(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    debug(`Resolving path of group: ${group.id} relative to SDK root`);
    const sdkRoot = MacOSSystemHelpers.findSDKRootDirectoryPath();
    if (!sdkRoot) {
      debug(`Failed to resolve SDK root directory path`);
      return undefined;
    }

    return path.join(sdkRoot, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Resolves the path of a group relative to the developer directory.
   *
   * The developer directory is the directory where the Xcode command line tools are installed.
   *
   * @param group - The group to resolve the path of
   * @returns The path of the group relative to the developer directory, or undefined if the group is not found or has no path
   */
  private resolvePathOfSynchronizedRootGroupRelativeToDeveloperDir(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): string | undefined {
    debug(
      `Resolving path of synchronized root group: ${group.id} relative to developer directory`,
    );
    const developerDir = MacOSSystemHelpers.findDeveloperDirectoryPath();
    if (!developerDir) {
      debug(`Failed to resolve developer directory path`);
      return undefined;
    }

    return path.join(developerDir, group.obj.path?.replace(/"/g, '') ?? '');
  }

  /**
   * Finds all files in the synchronized root groups of a target.
   *
   * @param nativeTarget - The target to find the files in
   * @returns The files in the synchronized root groups of the target, or an empty array if the target is not found or has no synchronized root groups
   */
  findFilesInSynchronizedRootGroups(
    nativeTarget: XcodeProjectObjectWithId<PBXNativeTarget>,
  ): string[] {
    debug(
      `Finding files in synchronized root groups for target: ${nativeTarget.obj.name}`,
    );
    const synchronizedRootGroups =
      nativeTarget.obj.fileSystemSynchronizedGroups ?? [];

    const result: string[] = [];
    for (const group of synchronizedRootGroups) {
      const groupObj =
        this.objects.PBXFileSystemSynchronizedRootGroup?.[group.value];
      if (!groupObj || typeof groupObj !== 'object') {
        debug(`Synchronized root group not found: ${group.value}`);
        continue;
      }
      debug(`Found synchronized root group: ${group.value}`);

      const files = this.getFilesInSynchronizedRootGroup({
        id: group.value,
        obj: groupObj,
      });
      debug(
        `Found ${files.length} files in synchronized root group: ${group.value}`,
      );
      result.push(...files.map((file) => file.path));
    }
    debug(
      `Found ${result.length} files in synchronized root groups for target: ${nativeTarget.obj.name}`,
    );
    return result;
  }

  private getFilesInSynchronizedRootGroup(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): ProjectFile[] {
    // Group path is expected to be set, therefore typing is non-nullable.
    // As the group is loaded from a project file, it is not guaranteed to be set,
    // therefore we treat it as optional.
    if (!group.obj.path) {
      debug(`Group path not found for group: ${group.id}`);
      return [];
    }

    // Resolve the path of the synchronized root group
    const absoluteGroupPath =
      this.resolveAbsolutePathOfSynchronizedRootGroup(group);
    if (!absoluteGroupPath) {
      debug(`Failed to resolve path of synchronized root group: ${group.id}`);
      return [];
    }

    // Build a list of all exception paths for the group
    const exceptionSets = this.getExceptionSetsForGroup(group);

    // Resolve a list of all files in the group
    const files = this.getAbsoluteFilePathsInDirectoryTree(absoluteGroupPath);

    // Filter out files that are excluded by the exception sets
    const filteredFiles = this.filterFilesByExceptionSets(files, exceptionSets);

    return filteredFiles;
  }

  /**
   * Returns all files in a directory tree.
   *
   * @param dirPath - The path of the directory to get the files in
   * @returns All files in the directory tree, or an empty array if the directory does not exist
   */
  private getAbsoluteFilePathsInDirectoryTree(dirPath: string): ProjectFile[] {
    // If the directory does not exist, return an empty array
    // This can happen if the group is not found in the project
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const result: ProjectFile[] = [];
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      // Ignore hidden files and directories
      if (file.startsWith('.')) {
        continue;
      }

      const filePath = path.join(dirPath, file);
      // If the file is a directory, recursively get the files in the directory
      if (fs.statSync(filePath).isDirectory()) {
        result.push(...this.getAbsoluteFilePathsInDirectoryTree(filePath));
        continue;
      }
      // If the file is a file, add it to the result
      if (fs.statSync(filePath).isFile()) {
        result.push({
          name: file,
          path: filePath,
        });
        continue;
      }
    }

    return result;
  }

  private filterFilesByExceptionSets(
    files: ProjectFile[],
    exceptionSets: XcodeProjectObjectWithId<PBXFileSystemSynchronizedBuildFileExceptionSet>[],
  ): ProjectFile[] {
    // Iterate over all files and filter out files that are excluded by any exception sets
    return files.filter((file) => {
      return !exceptionSets.some((exceptionSet) => {
        const membershipExceptions =
          exceptionSet.obj.membershipExceptions ?? [];
        return membershipExceptions.some((path) => {
          const unescapedPath = path.replace(/"/g, '');
          return file.path.includes(unescapedPath);
        });
      });
    });
  }

  // ================================ GROUP HELPERS ================================

  /**
   * Returns all groups that are PBXGroup.
   *
   * This is a helper method to avoid having to map and filter the groups manually.
   *
   * @returns All groups that are PBXGroup, excluding comments and non-object values.
   */
  private get groups(): XcodeProjectObjectWithId<PBXGroup>[] {
    // Map and filter the groups to only include the groups that are PBXGroup
    return Object.entries(this.objects.PBXGroup ?? {}).reduce(
      (acc, [key, group]) => {
        if (typeof group !== 'object') {
          return acc;
        }
        return acc.concat([
          {
            id: key,
            obj: group,
          },
        ]);
      },
      new Array<XcodeProjectObjectWithId<PBXGroup>>(),
    );
  }

  /**
   * Finds the parent group of a child group or file reference.
   *
   * @param childId - The ID of the child group or file reference
   * @returns The parent group of the child group or file reference, or undefined if the child group or file reference is not found or has no parent group
   */
  private findParentGroupByChildId(
    childId: string,
  ): XcodeProjectObjectWithId<PBXGroup> | undefined {
    return this.groups.find((group) => {
      return (group.obj.children ?? []).some((child) => {
        return child.value === childId;
      });
    });
  }

  /**
   * Checks if a group is the main group of any project.
   *
   * @param groupId - The ID of the group to check
   * @returns True if the group is the main group, false otherwise
   */
  private isMainGroup(groupId: string): boolean {
    return Object.values(this.objects.PBXProject ?? {}).some((project) => {
      if (typeof project !== 'object') {
        return false;
      }
      return project.mainGroup === groupId;
    });
  }

  private getExceptionSetsForGroup(
    group: XcodeProjectObjectWithId<PBXFileSystemSynchronizedRootGroup>,
  ): XcodeProjectObjectWithId<PBXFileSystemSynchronizedBuildFileExceptionSet>[] {
    const exceptions = group.obj.exceptions ?? [];
    const exceptionSets: XcodeProjectObjectWithId<PBXFileSystemSynchronizedBuildFileExceptionSet>[] =
      [];
    for (const exception of exceptions) {
      const exceptionSet =
        this.objects.PBXFileSystemSynchronizedBuildFileExceptionSet?.[
          exception.value
        ];
      if (typeof exceptionSet !== 'object') {
        continue;
      }
      exceptionSets.push({
        id: exception.value,
        obj: exceptionSet,
        comment: exception.comment,
      });
    }
    return exceptionSets;
  }

  /**
   * The path to the build products directory for the project.
   *
   * This is cached to avoid having to read the build settings from Xcode for each call to `getBuildProductsDirectoryPath`.
   */
  private buildProductsDir: string | undefined;

  /**
   * Returns the path to the build products directory for the project.
   *
   * @returns The path to the build products directory for the project, or undefined if the path is not found
   */
  private getBuildProductsDirectoryPath(): string | undefined {
    if (this.buildProductsDir) {
      return this.buildProductsDir;
    }
    const buildSettings = MacOSSystemHelpers.readXcodeBuildSettings(
      this.xcodeprojPath,
    );
    if (!buildSettings) {
      debug(`Failed to read Xcode build settings`);
      return undefined;
    }
    this.buildProductsDir =
      buildSettings['CONFIGURATION_BUILD_DIR'] ??
      buildSettings['TARGET_BUILD_DIR'] ??
      buildSettings['BUILD_DIR'];

    return this.buildProductsDir;
  }
}
