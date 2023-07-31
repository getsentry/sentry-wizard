/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from 'fs';
import { SentryProjectData } from '../utils/types';
import * as templates from './templates';
const xcode = require('xcode');

/* eslint-enable @typescript-eslint/no-unused-vars */

function setDebugInformationFormat(proj: any): void {
  const xcObjects = proj.hash.project.objects;
  const target = proj.getFirstTarget().firstTarget;

  xcObjects.XCConfigurationList[
    target.buildConfigurationList
  ].buildConfigurations.forEach((buildConfig: { value: string }) => {
    xcObjects.XCBuildConfiguration[
      buildConfig.value
    ].buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
  });
}

function addSentrySPM(proj: any): void {
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

  const target = proj.getFirstTarget().firstTarget;
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

  xcObjects.XCRemoteSwiftPackageReference = {};
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

  xcObjects.XCSwiftPackageProductDependency = {};
  xcObjects.XCSwiftPackageProductDependency[sentrySPMUUID] = {
    isa: 'XCSwiftPackageProductDependency',
    package: sentrySwiftPackageUUID,
    package_comment: 'XCRemoteSwiftPackageReference "sentry-cocoa"',
    productName: 'Sentry',
  };
  xcObjects.XCSwiftPackageProductDependency[sentrySPMUUID + '_comment'] =
    'Sentry';
}

function addUploadSymbolsScript(
  xcodeProject: any,
  sentryProject: SentryProjectData,
  apiKeys: { token: string },
  uploadSource = true,
): void {
  const xcObjects = xcodeProject.hash.project.objects;

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
    null,
    {
      inputFileListPaths: [],
      outputFileListPaths: [],
      inputPaths: [templates.scriptInputPath],
      shellPath: '/bin/sh',
      shellScript: templates.getRunScriptTemplate(
        sentryProject.organization.slug,
        sentryProject.slug,
        apiKeys.token,
        uploadSource,
      ),
    },
  );
}

export function updateXcodeProject(
  projectPath: string,
  sentryProject: SentryProjectData,
  apiKeys: { token: string },
  addSPMReference: boolean,
  uploadSource = true,
): void {
  const proj = xcode.project(projectPath);
  proj.parseSync();
  addUploadSymbolsScript(proj, sentryProject, apiKeys, uploadSource);
  if (uploadSource) {
    setDebugInformationFormat(proj);
  }
  if (addSPMReference) {
    addSentrySPM(proj);
  }
  const newContent = proj.writeSync();
  fs.writeFileSync(projectPath, newContent);
}
