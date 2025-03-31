/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debug } from '../utils/debug';
import type { SentryProjectData } from '../utils/types';
import * as templates from './templates';

import {
  project as createXcodeProject,
  PBXFileSystemSynchronizedRootGroup,
  type PBXBuildFile,
  type PBXGroup,
  type PBXNativeTarget,
  type PBXObjects,
  type PBXSourcesBuildPhase,
  type Project,
  type XCConfigurationList,
} from 'xcode';

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
  projectBaseDir: string;
  projectPath: string;
  project: Project;
  objects: PBXObjects;

  /**
   * Creates a new XcodeProject instance, a wrapper around the Xcode project file `<PROJECT>.xcodeproj/project.pbxproj`.
   *
   * @param projectPath - The path to the Xcode project file
   */
  public constructor(projectPath: string) {
    this.projectBaseDir = path.dirname(path.dirname(projectPath));
    this.projectPath = projectPath;
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
    fs.writeFileSync(this.projectPath, newContent);
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
    // - The `PBXFileSystemSynchronizedRootGroup` has a list of `membershipExceptions` which are files to be excluded from the build
    // - The Xcode project has a build phase `PBXSourcesBuildPhase` which has a list of `files` which are `PBXBuildFile`
    // - A file which is not part of a `PBXFileSystemSynchronizedRootGroup` must be added to the `files` list of the `PBXSourcesBuildPhase` build phase
    // - Nested subfolders in `fileSystemSynchronizedGroups` are not declared but recursively included
    //
    // Based on the findings above the files included in the build phase are:
    // - All files in the `files` of the `PBXSourcesBuildPhase` build phase `Sources` of the target
    // - All files in directories of the `fileSystemSynchronizedGroups` of the target
    // - Excluding all files in the `membershipExceptions` of the `fileSystemSynchronizedGroups` of the target
    debug('Finding target by name: ' + targetName);
    const nativeTarget = Object.entries(
      this.objects.PBXNativeTarget ?? {},
    ).find(([key, target]) => {
      // Ignore comments
      if (key.endsWith('_comment') || typeof target === 'string') {
        return false;
      }
      // Ignore targets that are not the target we are looking for
      if (target.name !== targetName) {
        return false;
      }
      return true;
    })?.[1] as PBXNativeTarget | undefined;
    if (!nativeTarget) {
      debug('Target not found: ' + targetName);
      return undefined;
    }

    debug('Finding files in build phase for target: ' + targetName);
    const filesInBuildPhase = this.findFilesInBuildPhase(nativeTarget);
    debug(
      `Found ${filesInBuildPhase.length} files in build phase for target: ${targetName}`,
    );

    debug(
      `Finding files in synchronized root groups for target: ${targetName}`,
    );
    const filesInSynchronizedRootGroups =
      this.findFilesInSynchronizedRootGroups(nativeTarget);
    debug(
      `Found ${filesInSynchronizedRootGroups.length} files in synchronized root groups for target: ${targetName}`,
    );

    return [...filesInBuildPhase, ...filesInSynchronizedRootGroups];
  }

  public findFilesInBuildPhase(nativeTarget: PBXNativeTarget): string[] {
    const buildPhase = this.findSourceBuildPhaseInTarget(nativeTarget);
    if (!buildPhase) {
      debug(`Sources build phase not found for target: ${nativeTarget.name}`);
      return [];
    }
    const buildPhaseFiles = buildPhase.files;
    if (!buildPhaseFiles) {
      debug(
        `No files found in sources build phase for target: ${nativeTarget.name}`,
      );
      return [];
    }

    if (!this.objects.PBXBuildFile) {
      debug('PBXBuildFile is undefined');
      return [];
    }
    const result: string[] = [];
    for (const file of buildPhaseFiles) {
      debug(`Resolving build phase file: ${file.value}`);
      const buildFileObj = this.objects.PBXBuildFile[
        file.value
      ] as PBXBuildFile;
      if (!buildFileObj || typeof buildFileObj !== 'object') {
        debug(`Build file object not found for file: ${file.value}`);
        continue;
      }
      debug(`Build file object found for file: ${file.value}`);

      const fileRef = buildFileObj.fileRef;
      if (!fileRef) {
        debug(`File reference not found for file: ${file.value}`);
        continue;
      }
      debug(`File reference found for file: ${file.value}`);

      const buildFile = this.objects.PBXFileReference?.[fileRef];
      if (!buildFile || typeof buildFile !== 'object') {
        debug(`File not found in file dictionary for file: ${file.value}`);
        continue;
      }
      debug(`File found in file dictionary for file: ${file.value}`);

      // File path is expected to be set, therefore typing is non-nullable.
      // As the file is loaded from a project file, it is not guaranteed to be set,
      // therefore we treat it as optional.
      if (!buildFile.path) {
        debug(`File path not found for file: ${file.value}`);
        continue;
      }

      // Return the absolute path by joining with the project base directory
      const resolvedFilePath = path.join(
        this.projectBaseDir,
        buildFile.path.replace(/"/g, ''),
      );
      debug(`Resolved file ${file.value} to path: ${resolvedFilePath}`);
      result.push(resolvedFilePath);
    }
    debug(`Resolved ${result.length} files for target: ${nativeTarget.name}`);

    return result;
  }

  public findSourceBuildPhaseInTarget(
    target: PBXNativeTarget,
  ): PBXSourcesBuildPhase | undefined {
    if (!target.buildPhases) {
      return undefined;
    }
    const buildPhase = target.buildPhases
      .map((phase) => {
        // Map the build phase key to the build phase object
        return this.objects.PBXSourcesBuildPhase?.[phase.value];
      })
      .find((phase) => {
        return phase !== undefined;
      }) as PBXSourcesBuildPhase | undefined;
    return buildPhase;
  }

  public findFilesInSynchronizedRootGroups(
    nativeTarget: PBXNativeTarget,
  ): string[] {
    debug(
      `Finding files in synchronized root groups for target: ${nativeTarget.name}`,
    );
    const synchronizedRootGroups = nativeTarget.fileSystemSynchronizedGroups;
    if (!synchronizedRootGroups) {
      debug(
        `No synchronized root groups found for target: ${nativeTarget.name}`,
      );
      return [];
    }

    const result: string[] = [];
    for (const group of synchronizedRootGroups) {
      const groupObj =
        this.objects.PBXFileSystemSynchronizedRootGroup?.[group.value];
      if (!groupObj || typeof groupObj !== 'object') {
        debug(`Synchronized root group not found: ${group.value}`);
        continue;
      }
      debug(`Found synchronized root group: ${group.value}`);
      const files = XcodeProject.getFilesInSynchronizedRootGroup(
        groupObj,
        this.projectBaseDir,
      );
      debug(
        `Found ${files.length} files in synchronized root group: ${group.value}`,
      );
      result.push(...files.map((file) => file.path));
    }
    debug(
      `Found ${result.length} files in synchronized root groups for target: ${nativeTarget.name}`,
    );
    return result;
  }

  public getProjectFiles(): ProjectFile[] {
    const proj = this.project.getFirstProject();
    // Every Xcode Project has exactly one main group.
    const mainGroupKey = proj.firstProject.mainGroup;
    const mainGroup = this.objects.PBXGroup?.[mainGroupKey];
    // If the main group is not found, or only the comment is present, there are no files in the project.
    if (!mainGroup || typeof mainGroup === 'string') {
      return [];
    }
    // Recursively get all files in the main group.
    return this.getFilesInGroup(mainGroup, this.projectBaseDir);
  }

  public getFilesInGroup(group: PBXGroup, groupPath: string): ProjectFile[] {
    const result: ProjectFile[] = [];
    for (const child of group.children ?? []) {
      const fileReference = this.objects.PBXFileReference?.[child.value];
      if (fileReference && typeof fileReference !== 'string') {
        // File path is expected to be set, therefore typing is non-nullable.
        // As the file is loaded from a project file, it is not guaranteed to be set,
        // therefore we treat it as optional.
        if (!fileReference.path) {
          debug(`File path not found for file: ${child.value}`);
          continue;
        }

        const name = fileReference.path.replace(/"/g, '');
        result.push({
          key: child.value,
          name: name,
          path: path.join(groupPath, name),
        });
        continue;
      }

      const group = this.objects.PBXGroup?.[child.value];
      if (group && typeof group !== 'string') {
        let expandedGroupPath = groupPath;
        if (group.path) {
          expandedGroupPath = path.join(
            groupPath,
            group.path.replace(/"/g, ''),
          );
        }
        const groupFiles = this.getFilesInGroup(group, expandedGroupPath);
        result.push(...groupFiles);
        continue;
      }

      const synchronizedFileSystemGroup =
        this.objects.PBXFileSystemSynchronizedRootGroup?.[child.value];
      if (
        synchronizedFileSystemGroup &&
        typeof synchronizedFileSystemGroup !== 'string'
      ) {
        const groupFiles = XcodeProject.getFilesInSynchronizedRootGroup(
          synchronizedFileSystemGroup,
          groupPath,
        );
        result.push(...groupFiles);
        continue;
      }
    }
    return result;
  }

  public static getFilesInSynchronizedRootGroup(
    group: PBXFileSystemSynchronizedRootGroup,
    parentGroupPath: string,
  ): ProjectFile[] {
    // Group path is expected to be set, therefore typing is non-nullable.
    // As the group is loaded from a project file, it is not guaranteed to be set,
    // therefore we treat it as optional.
    if (!group.path) {
      debug(
        `Group path not found for group with parent path: ${parentGroupPath}`,
      );
      return [];
    }

    // Resolve the group path to the real path
    const groupPath = path.join(parentGroupPath, group.path.replace(/"/g, ''));
    return this.getFilesInDirectoryTree(groupPath);
  }

  public static getFilesInDirectoryTree(dirPath: string): ProjectFile[] {
    // If the directory does not exist, return an empty array
    // This can happen if the group is not found in the project
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const result: ProjectFile[] = [];
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      // If the file is a directory, recursively get the files in the directory
      if (fs.statSync(filePath).isDirectory()) {
        result.push(...this.getFilesInDirectoryTree(filePath));
        continue;
      }
      // Ignore hidden files
      if (file.startsWith('.')) {
        continue;
      }
      // If the file is a file, add it to the result
      result.push({
        name: file,
        path: filePath,
      });
    }
    return result;
  }
}
