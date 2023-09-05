/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as fs from 'fs';
import { SentryProjectData } from '../utils/types';
import * as templates from './templates';
import * as path from 'path';
const xcode = require('xcode');

interface ProjetFile {
  key: string;
  path: string;
}

function setDebugInformationFormat(proj: any, targetName: string): void {
  const xcObjects = proj.hash.project.objects;
  const targetKey: string = Object.keys(xcObjects.PBXNativeTarget || {}).filter(
    (key) => {
      return (
        !key.endsWith('_comment') &&
        xcObjects.PBXNativeTarget[key].name === targetName
      );
    },
  )[0];
  const target = xcObjects.PBXNativeTarget[targetKey];

  xcObjects.XCConfigurationList[
    target.buildConfigurationList
  ].buildConfigurations.forEach((buildConfig: { value: string }) => {
    xcObjects.XCBuildConfiguration[
      buildConfig.value
    ].buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
  });
}

function addSentrySPM(proj: any, targetName: string): void {
  const xcObjects = proj.hash.project.objects;

  const sentryFrameworkUUID = proj.generateUuid() as string;
  const sentrySPMUUID = proj.generateUuid() as string;

  //Check whether xcObjects already have sentry framework
  if (xcObjects.PBXFrameworksBuildPhase) {
    for (const key in xcObjects.PBXFrameworksBuildPhase || {}) {
      if (!key.endsWith('_comment')) {
        const frameworks = xcObjects.PBXFrameworksBuildPhase[key].files;
        for (const framework of frameworks) {
          if (framework.comment === 'Sentry in Frameworks') {
            return;
          }
        }
      }
    }
  }

  xcObjects.PBXBuildFile[sentryFrameworkUUID] = {
    isa: 'PBXBuildFile',
    productRef: sentrySPMUUID,
    productRef_comment: 'Sentry',
  };
  xcObjects.PBXBuildFile[sentryFrameworkUUID + '_comment'] =
    'Sentry in Frameworks';

  for (const key in xcObjects.PBXFrameworksBuildPhase || {}) {
    if (!key.endsWith('_comment')) {
      const frameworks = xcObjects.PBXFrameworksBuildPhase[key].files;
      frameworks.push({
        value: sentryFrameworkUUID,
        comment: 'Sentry in Frameworks',
      });
    }
  }

  const targetKey: string = Object.keys(xcObjects.PBXNativeTarget || {}).filter(
    (key) => {
      return (
        !key.endsWith('_comment') &&
        xcObjects.PBXNativeTarget[key].name === targetName
      );
    },
  )[0];
  const target = xcObjects.PBXNativeTarget[targetKey];

  if (!target.packageProductDependencies) {
    target.packageProductDependencies = [];
  }
  target.packageProductDependencies.push({
    value: sentrySPMUUID,
    comment: 'Sentry',
  });

  const sentrySwiftPackageUUID = proj.generateUuid() as string;
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
  xcObjects.XCRemoteSwiftPackageReference[sentrySwiftPackageUUID + '_comment'] =
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
  xcObjects.XCSwiftPackageProductDependency[sentrySPMUUID + '_comment'] =
    'Sentry';

  clack.log.step('Added Sentry SPM dependency to your project');
}

function addUploadSymbolsScript(
  xcodeProject: any,
  sentryProject: SentryProjectData,
  targetName: string,
  uploadSource = true,
): void {
  const xcObjects = xcodeProject.hash.project.objects;
  const targetKey: string = Object.keys(xcObjects.PBXNativeTarget || {}).filter(
    (key) => {
      return (
        !key.endsWith('_comment') &&
        xcObjects.PBXNativeTarget[key].name === targetName
      );
    },
  )[0];

  for (const scriptKey in xcObjects.PBXShellScriptBuildPhase || {}) {
    if (!scriptKey.endsWith('_comment')) {
      const script = xcObjects.PBXShellScriptBuildPhase[scriptKey].shellScript;
      //Sentry script already exists, update it
      if (script.includes('sentry-cli')) {
        delete xcObjects.PBXShellScriptBuildPhase[scriptKey];
        delete xcObjects.PBXShellScriptBuildPhase[scriptKey + '_comment'];
        break;
      }
    }
  }

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
      ),
    },
  );
  clack.log.step(`Added Sentry upload script to "${targetName}" build phase`);
}

export class XcodeProject {
  projectPath: string;
  project: any;
  objects: any;
  files: ProjetFile[] | undefined;

  public constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.project = xcode.project(projectPath);
    this.project.parseSync();
    this.objects = this.project.hash.project.objects;
  }

  public getAllTargets(): string[] {
    return Object.keys(this.objects.PBXNativeTarget || {})
      .filter((key) => {
        return (
          !key.endsWith('_comment') &&
          this.objects.PBXNativeTarget[key].productType.startsWith(
            '"com.apple.product-type.application',
          )
        );
      })
      .map((key) => {
        return this.objects.PBXNativeTarget[key].name as string;
      });
  }

  public updateXcodeProject(
    sentryProject: SentryProjectData,
    target: string,
    apiKeys: { token: string },
    addSPMReference: boolean,
    uploadSource = true,
  ): void {
    addUploadSymbolsScript(this.project, sentryProject, target, uploadSource);
    if (uploadSource) {
      setDebugInformationFormat(this.project, target);
    }
    if (addSPMReference) {
      addSentrySPM(this.project, target);
    }
    const newContent = this.project.writeSync();
    fs.writeFileSync(this.projectPath, newContent);
  }

  public filesForTarget(target: string): string[] | undefined {
    const files = this.projectFiles();
    const fileDictionary: any = {};
    files.forEach((file) => {
      fileDictionary[file.key] = file.path;
    });

    const nativeTarget = Object.keys(this.objects.PBXNativeTarget || {}).filter(
      (key) => {
        return (
          !key.endsWith('_comment') &&
          this.objects.PBXNativeTarget[key].name === target
        );
      },
    )[0];

    if (nativeTarget === undefined) {
      return undefined;
    }

    const buildPhaseKey = this.objects.PBXNativeTarget[
      nativeTarget
    ].buildPhases.filter((phase: any) => {
      return this.objects.PBXSourcesBuildPhase[phase.value] !== undefined;
    })[0];

    if (buildPhaseKey === undefined) {
      return undefined;
    }

    const buildPhases = this.objects.PBXSourcesBuildPhase[buildPhaseKey.value];
    if (buildPhases === undefined) {
      return undefined;
    }

    const baseDir = path.dirname(path.dirname(this.projectPath));

    return buildPhases.files
      .map((file: any) => {
        const buildFile = fileDictionary[
          this.objects.PBXBuildFile[file.value].fileRef
        ] as string;
        if (!buildFile) {
          return '';
        }
        return path.join(baseDir, buildFile);
      })
      .filter((f: string) => f.length > 0) as string[];
  }

  projectFiles(): ProjetFile[] {
    if (this.files === undefined) {
      const proj = this.project.getFirstProject();
      const mainGroupKey = proj.firstProject.mainGroup;
      const mainGroup = this.objects.PBXGroup[mainGroupKey];
      this.files = this.buildGroup(mainGroup);
    }
    return this.files;
  }

  buildGroup(group: any, path = ''): ProjetFile[] {
    const result: ProjetFile[] = [];
    for (const child of group.children) {
      if (this.objects.PBXFileReference[child.value]) {
        const fileReference = this.objects.PBXFileReference[child.value];
        result.push({
          key: child.value,
          path: `${path}${fileReference.path.replace(/"/g, '')}`,
        });
      } else if (this.objects.PBXGroup[child.value]) {
        const groupReference = this.objects.PBXGroup[child.value];
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
