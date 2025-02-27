/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SentryProjectData } from '../utils/types';
import * as templates from './templates';

import {
  project as createXcodeProject,
  type PBXBuildFile,
  type PBXGroup,
  type PBXNativeTarget,
  type PBXObjects,
  type PBXSourcesBuildPhase,
  type Project,
  type XCConfigurationList,
} from 'xcode';

interface ProjectFile {
  key: string;
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
  projectPath: string;
  project: Project;
  objects: PBXObjects;
  files: ProjectFile[] | undefined;

  /**
   * Creates a new XcodeProject instance, a wrapper around the Xcode project file `<PROJECT>.xcodeproj/project.pbxproj`.
   *
   * @param projectPath - The path to the Xcode project file
   */
  public constructor(projectPath: string) {
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

  public filesForTarget(target: string): string[] | undefined {
    const files = this.projectFiles();
    const fileDictionary: Record<string, string> = {};
    files.forEach((file) => {
      fileDictionary[file.key] = file.path;
    });

    const targets = this.objects.PBXNativeTarget || {};
    const nativeTarget = Object.keys(targets).filter((key) => {
      const value = targets[key];
      return (
        !key.endsWith('_comment') &&
        typeof value !== 'string' &&
        value.name === target
      );
    })[0];

    if (nativeTarget === undefined) {
      return undefined;
    }

    const buildPhaseKey = (
      targets[nativeTarget] as PBXNativeTarget
    ).buildPhases?.filter((phase) => {
      return this.objects.PBXSourcesBuildPhase?.[phase.value] !== undefined;
    })[0];

    if (buildPhaseKey === undefined) {
      return undefined;
    }

    const buildPhase = this.objects.PBXSourcesBuildPhase?.[
      buildPhaseKey.value
    ] as PBXSourcesBuildPhase;
    const buildPhaseFiles = buildPhase?.files ?? [];

    const baseDir = path.dirname(path.dirname(this.projectPath));

    return buildPhaseFiles
      .map((file) => {
        const fileRef = (
          this.objects.PBXBuildFile?.[file.value] as PBXBuildFile
        )?.fileRef;
        if (!fileRef) {
          return '';
        }
        const buildFile = fileDictionary[fileRef];
        if (!buildFile) {
          return '';
        }
        return path.join(baseDir, buildFile);
      })
      .filter((f: string) => f.length > 0);
  }

  projectFiles(): ProjectFile[] {
    if (this.files === undefined) {
      const proj = this.project.getFirstProject();
      const mainGroupKey = proj.firstProject.mainGroup;
      const mainGroup = this.objects.PBXGroup?.[mainGroupKey];
      if (!mainGroup || typeof mainGroup === 'string') {
        return [];
      }
      this.files = this.buildGroup(mainGroup);
    }
    return this.files;
  }

  buildGroup(group: PBXGroup, path = ''): ProjectFile[] {
    const result: ProjectFile[] = [];
    for (const child of group.children ?? []) {
      const fileReference = this.objects.PBXFileReference?.[child.value];
      const groupReference = this.objects.PBXGroup?.[child.value];
      if (fileReference) {
        if (typeof fileReference === 'string') {
          continue;
        }
        result.push({
          key: child.value,
          path: `${path}${fileReference.path.replace(/"/g, '')}`,
        });
      } else if (groupReference) {
        if (typeof groupReference === 'string') {
          continue;
        }
        const groupChildren = this.buildGroup(
          groupReference,
          groupReference.path
            ? `${path}${groupReference.path.replace(/"/g, '')}/`
            : path,
        );
        result.push(...groupChildren);
      }
    }
    return result;
  }
}
