import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  PBXFileReference,
  PBXFileSystemSynchronizedRootGroup,
  PBXGroup,
  PBXNativeTarget,
  PBXProject,
  PBXShellScriptBuildPhase,
  XCBuildConfiguration,
} from 'xcode';
import { getRunScriptTemplate } from '../../src/apple/templates';
import { XcodeProject } from '../../src/apple/xcode-manager';
import type { SentryProjectData } from '../../src/utils/types';

jest.mock('node:fs', () => ({
  __esModule: true,
  ...jest.requireActual<typeof fs>('node:fs'),
}));

jest.mock('@clack/prompts', () => ({
  log: {
    info: jest.fn(),
    success: jest.fn(),
    step: jest.fn(),
  },
}));

const appleProjectsPath = path.resolve(
  __dirname,
  '../../fixtures/test-applications/apple',
);
const damagedProjectPath = path.join(
  appleProjectsPath,
  'damaged-missing-configuration-list/Project.xcodeproj/project.pbxproj',
);
const noTargetsProjectPath = path.join(
  appleProjectsPath,
  'no-targets/Project.xcodeproj/project.pbxproj',
);
const noFilesInTargetProjectPath = path.join(
  appleProjectsPath,
  'no-files-in-target/Project.xcodeproj/project.pbxproj',
);
const projectWithSynchronizedFolders = path.join(
  appleProjectsPath,
  'project-with-synchronized-folders/Project.xcodeproj/project.pbxproj',
);
const singleTargetProjectPath = path.join(
  appleProjectsPath,
  'spm-swiftui-single-target/Project.xcodeproj/project.pbxproj',
);
const multiTargetProjectPath = path.join(
  appleProjectsPath,
  'spm-swiftui-multi-targets/Project.xcodeproj/project.pbxproj',
);
const projectData: SentryProjectData = {
  id: '1234567890',
  slug: 'project',
  organization: {
    id: '1234567890',
    name: 'Sentry',
    slug: 'sentry',
  },
  keys: [{ dsn: { public: 'https://sentry.io/1234567890' } }],
};

describe('XcodeManager', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('XcodeProject', () => {
    describe('getAllTargets', () => {
      describe('single target', () => {
        it('should return all targets', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);

          // -- Act --
          const targets = xcodeProject.getAllTargets();

          // -- Assert --
          expect(targets).toEqual(['Project']);
        });
      });

      describe('multiple targets', () => {
        it('should return all targets', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(multiTargetProjectPath);

          // -- Act --
          const targets = xcodeProject.getAllTargets();

          // -- Assert --
          expect(targets).toEqual(['Project1', 'Project2']);
        });
      });

      describe('no targets', () => {
        it('should return an empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(noTargetsProjectPath);

          // -- Act --
          const targets = xcodeProject.getAllTargets();

          // -- Assert --
          expect(targets).toEqual([]);
        });
      });

      describe('project with missing configuration list', () => {
        it('should return an empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(damagedProjectPath);

          // -- Act --
          const targets = xcodeProject.getAllTargets();

          // -- Assert --
          expect(targets).toEqual([]);
        });
      });
    });

    describe('updateXcodeProject', () => {
      let sourceProjectPath: string;
      let tempProjectPath: string;
      let xcodeProject: XcodeProject;

      beforeEach(() => {
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'update-xcode-project'),
        );

        sourceProjectPath = singleTargetProjectPath;
        tempProjectPath = path.resolve(tempDir, 'project.pbxproj');

        fs.copyFileSync(sourceProjectPath, tempProjectPath);
        xcodeProject = new XcodeProject(tempProjectPath);
      });

      describe('upload symbols script', () => {
        const scriptVariants: {
          uploadSource: boolean;
          includeHomebrewPath: boolean;
        }[] = [
          {
            uploadSource: true,
            includeHomebrewPath: true,
          },
          {
            uploadSource: true,
            includeHomebrewPath: false,
          },
          {
            uploadSource: false,
            includeHomebrewPath: true,
          },
          {
            uploadSource: false,
            includeHomebrewPath: false,
          },
        ];

        for (const variant of scriptVariants) {
          describe(`upload source = ${variant.uploadSource?.toString()} and include homebrew path = ${variant.includeHomebrewPath.toString()}`, () => {
            beforeEach(() => {
              jest
                .spyOn(fs, 'existsSync')
                .mockReturnValue(variant.includeHomebrewPath);
            });

            afterEach(() => {
              jest.restoreAllMocks();
            });

            it('should add the upload symbols script to the target', () => {
              // -- Arrange --
              const generatedShellScript = getRunScriptTemplate(
                projectData.organization.slug,
                projectData.slug,
                variant.uploadSource,
                variant.includeHomebrewPath,
              );
              const expectedShellScript = `"${generatedShellScript.replace(
                /"/g,
                '\\"',
              )}"`;

              // -- Act --
              xcodeProject.updateXcodeProject(
                projectData,
                'Project',
                false, // Ignore SPM reference
                variant.uploadSource,
              );

              // -- Assert --
              const updatedXcodeProject = new XcodeProject(tempProjectPath);

              // Expect the upload symbols script to be added
              const scriptObjects =
                updatedXcodeProject.objects.PBXShellScriptBuildPhase;
              expect(scriptObjects).toBeDefined();
              if (!scriptObjects) {
                throw new Error('Script objects not found');
              }
              const scriptKeys = Object.keys(scriptObjects);
              expect(scriptKeys).toHaveLength(2);

              // Find the script ID
              const scriptId = scriptKeys.find(
                (key) => !key.endsWith('_comment'),
              );
              expect(scriptId).toBeDefined();
              if (!scriptId) {
                throw new Error('Script ID not found');
              }
              expect(scriptId).toMatch(/^[A-F0-9]{24}$/i);

              // Expect the script to be added
              const script = scriptObjects[
                scriptId
              ] as PBXShellScriptBuildPhase;
              expect(script).toBeDefined();
              expect(typeof script).not.toBe('string');
              expect(script.inputPaths).toEqual([
                '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"',
              ]);
              expect(script.outputPaths).toEqual([]);
              expect(script.shellPath).toBe('/bin/sh');
              expect(script.shellScript).toEqual(expectedShellScript);

              const commentKey = `${scriptId}_comment`;
              expect(scriptKeys).toContain(commentKey);
              expect(scriptObjects[commentKey]).toBe(
                'Upload Debug Symbols to Sentry',
              );
            });
          });
        }
      });

      describe('debug information format and sandbox', () => {
        describe('upload source is false', () => {
          it('should not update the Xcode project', () => {
            // -- Act --
            xcodeProject.updateXcodeProject(
              projectData,
              'Project',
              false, // Ignore SPM reference
              false,
            );

            // -- Assert --
            const expectedXcodeProject = new XcodeProject(sourceProjectPath);
            expect(xcodeProject.objects.XCBuildConfiguration).toEqual(
              expectedXcodeProject.objects.XCBuildConfiguration,
            );
          });
        });

        describe('upload source is true', () => {
          const uploadSource = true;

          describe('named target not found', () => {
            it('should not update the flags in the Xcode project', () => {
              // -- Act --
              xcodeProject.updateXcodeProject(
                projectData,
                'Invalid Target Name',
                false, // Ignore SPM reference
                uploadSource,
              );

              // -- Assert --
              const originalXcodeProject = new XcodeProject(sourceProjectPath);
              expect(xcodeProject.objects.XCBuildConfiguration).toEqual(
                originalXcodeProject.objects.XCBuildConfiguration,
              );
            });
          });

          describe('named target found', () => {
            describe('build configurations is undefined', () => {
              it('should not update the Xcode project', () => {
                // -- Act --
                xcodeProject.updateXcodeProject(
                  projectData,
                  'Invalid Target Name',
                  false, // Ignore SPM reference
                  uploadSource,
                );

                // -- Assert --
                const originalXcodeProject = new XcodeProject(
                  sourceProjectPath,
                );
                expect(xcodeProject.objects.XCBuildConfiguration).toEqual(
                  originalXcodeProject.objects.XCBuildConfiguration,
                );
              });
            });

            describe('no build configurations found', () => {
              it('should not update the Xcode project', () => {
                // -- Arrange --
                xcodeProject.objects.XCBuildConfiguration = {};

                // -- Act --
                xcodeProject.updateXcodeProject(
                  projectData,
                  'Invalid Target Name',
                  false, // Ignore SPM reference
                  uploadSource,
                );

                // -- Assert --
                expect(xcodeProject.objects.XCBuildConfiguration).toEqual({});
              });
            });

            describe('build configurations found', () => {
              const debugProjectBuildConfigurationListId =
                'D4E604DA2D50CEEE00CAB00F';
              const releaseProjectBuildConfigurationListId =
                'D4E604DB2D50CEEE00CAB00F';
              const debugTargetBuildConfigurationListId =
                'D4E604DD2D50CEEE00CAB00F';
              const releaseTargetBuildConfigurationListId =
                'D4E604DE2D50CEEE00CAB00F';

              it('should update the target configuration lists', () => {
                // -- Act --
                xcodeProject.updateXcodeProject(
                  projectData,
                  'Project',
                  false, // Ignore SPM reference
                  uploadSource,
                );

                // -- Assert --
                expect(xcodeProject.objects.XCBuildConfiguration).toBeDefined();
                // Both Debug and Release are configured equally
                const expectedConfigKeys = [
                  debugTargetBuildConfigurationListId, // Debug
                  releaseTargetBuildConfigurationListId, // Release
                ];
                for (const key of expectedConfigKeys) {
                  const buildConfiguration = xcodeProject.objects
                    .XCBuildConfiguration?.[key] as XCBuildConfiguration;
                  expect(buildConfiguration).toBeDefined();
                  expect(typeof buildConfiguration).not.toBe('string');
                  const buildSettings = buildConfiguration.buildSettings ?? {};
                  expect(buildSettings.DEBUG_INFORMATION_FORMAT).toBe(
                    '"dwarf-with-dsym"',
                  );
                  expect(buildSettings.ENABLE_USER_SCRIPT_SANDBOXING).toBe(
                    '"NO"',
                  );
                }
              });

              it('should not update the project configuration lists', () => {
                // -- Act --
                xcodeProject.updateXcodeProject(
                  projectData,
                  'Project',
                  false, // Ignore SPM reference
                  uploadSource,
                );

                // -- Assert --
                expect(xcodeProject.objects.XCBuildConfiguration).toBeDefined();

                // Check project build configurations 'Debug'
                const debugBuildConfiguration = xcodeProject.objects
                  .XCBuildConfiguration?.[
                  debugProjectBuildConfigurationListId
                ] as XCBuildConfiguration;
                expect(debugBuildConfiguration).toBeDefined();
                expect(typeof debugBuildConfiguration).not.toBe('string');
                expect(
                  debugBuildConfiguration.buildSettings
                    ?.DEBUG_INFORMATION_FORMAT,
                ).toBe('dwarf');
                expect(
                  debugBuildConfiguration.buildSettings
                    ?.ENABLE_USER_SCRIPT_SANDBOXING,
                ).toBe('YES');

                // Check project build configurations 'Release'
                const releaseBuildConfiguration = xcodeProject.objects
                  .XCBuildConfiguration?.[
                  releaseProjectBuildConfigurationListId
                ] as XCBuildConfiguration;
                expect(releaseBuildConfiguration).toBeDefined();
                expect(typeof releaseBuildConfiguration).not.toBe('string');
                expect(
                  releaseBuildConfiguration.buildSettings
                    ?.DEBUG_INFORMATION_FORMAT,
                ).toBe('"dwarf-with-dsym"');
                expect(
                  releaseBuildConfiguration.buildSettings
                    ?.ENABLE_USER_SCRIPT_SANDBOXING,
                ).toBe('YES');
              });
            });
          });
        });
      });

      describe('add SPM reference', () => {
        const addSPMReference = true;

        describe('framework build phase already contains Sentry', () => {
          it('should not update the Xcode project', () => {
            // -- Arrange --
            xcodeProject.objects.PBXFrameworksBuildPhase = {
              'framework-id': {
                isa: 'PBXFrameworksBuildPhase',
                files: [
                  {
                    value: '123',
                    comment: 'Sentry in Frameworks',
                  },
                ],
              },
            };

            // -- Act --
            xcodeProject.updateXcodeProject(
              projectData,
              'Project',
              addSPMReference,
            );

            // -- Assert --
            const expectedXcodeProject = new XcodeProject(sourceProjectPath);
            expectedXcodeProject.objects.PBXFrameworksBuildPhase = {
              'framework-id': {
                isa: 'PBXFrameworksBuildPhase',
                files: [
                  {
                    value: '123',
                    comment: 'Sentry in Frameworks',
                  },
                ],
              },
            };
            expect(xcodeProject.objects.PBXFrameworksBuildPhase).toEqual(
              expectedXcodeProject.objects.PBXFrameworksBuildPhase,
            );
            expect(xcodeProject.objects.XCRemoteSwiftPackageReference).toEqual(
              expectedXcodeProject.objects.XCRemoteSwiftPackageReference,
            );
            expect(
              xcodeProject.objects.XCSwiftPackageProductDependency,
            ).toEqual(
              expectedXcodeProject.objects.XCSwiftPackageProductDependency,
            );
          });
        });

        it('should add the SPM reference to the target', () => {
          // -- Act --
          xcodeProject.updateXcodeProject(
            projectData,
            'Project',
            addSPMReference,
          );

          // -- Assert --
          // Get the target
          const target = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          expect(target).toBeDefined();
          if (!target) {
            throw new Error('Target is undefined');
          }

          // Check the SPM dependency is added to the target
          expect(target.packageProductDependencies).toEqual([
            expect.objectContaining({
              value: expect.any(String) as string,
              comment: 'Sentry',
            }),
          ]);

          // Check the SPM package reference object is added to the project
          const remoteSwiftPackageReferences =
            xcodeProject.objects.XCRemoteSwiftPackageReference;
          expect(remoteSwiftPackageReferences).toBeDefined();
          if (!remoteSwiftPackageReferences) {
            throw new Error('XCRemoteSwiftPackageReference is undefined');
          }
          const rspRefKeys = Object.keys(remoteSwiftPackageReferences);
          expect(rspRefKeys).toHaveLength(2);
          // First key is expected to be the UUID of the SPM package reference
          expect(rspRefKeys[0]).toMatch(/^[A-F0-9]{24}$/i);
          // Second key is expected to be the UUID of the SPM package reference with _comment suffix
          expect(rspRefKeys[1]).toMatch(/^[A-F0-9]{24}_comment$/i);

          expect(remoteSwiftPackageReferences?.[rspRefKeys[0]]).toEqual({
            isa: 'XCRemoteSwiftPackageReference',
            repositoryURL: '"https://github.com/getsentry/sentry-cocoa/"',
            requirement: {
              kind: 'upToNextMajorVersion',
              minimumVersion: '8.0.0',
            },
          });
          expect(remoteSwiftPackageReferences?.[rspRefKeys[1]]).toBe(
            'XCRemoteSwiftPackageReference "sentry-cocoa"',
          );

          // Check the SPM package is a dependency of the target
          const packageProductDependencies =
            xcodeProject.objects.XCSwiftPackageProductDependency;
          expect(packageProductDependencies).toBeDefined();
          if (!packageProductDependencies) {
            throw new Error('XCSwiftPackageProductDependency is undefined');
          }
          const ppDepKeys = Object.keys(packageProductDependencies);
          expect(ppDepKeys).toHaveLength(2);
          // First key is expected to be the UUID of the SPM package dependency
          expect(ppDepKeys[0]).toMatch(/^[A-F0-9]{24}$/i);
          // Second key is expected to be the UUID of the SPM package dependency with _comment suffix
          expect(ppDepKeys[1]).toMatch(/^[A-F0-9]{24}_comment$/i);
          expect(packageProductDependencies?.[ppDepKeys[0]]).toEqual({
            isa: 'XCSwiftPackageProductDependency',
            package: rspRefKeys[0],
            package_comment: 'XCRemoteSwiftPackageReference "sentry-cocoa"',
            productName: 'Sentry',
          });
        });
      });
    });

    describe('getSourceFilesForTarget', () => {
      describe('targets are undefined', () => {
        it('should return undefined', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = undefined;

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toBeUndefined();
        });
      });

      describe('target not found', () => {
        it('should return undefined', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);

          // -- Act --
          const files =
            xcodeProject.getSourceFilesForTarget('NonExistentTarget');

          // -- Assert --
          expect(files).toBeUndefined();
        });
      });

      describe('target build phases are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            Project: {
              isa: 'PBXNativeTarget',
              name: 'Project',
              buildPhases: undefined,
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phases are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            Project: {
              isa: 'PBXNativeTarget',
              name: 'Project',
              buildPhases: undefined,
            },
          };
          xcodeProject.objects.PBXSourcesBuildPhase = undefined;

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('referenced build phase is undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            Project: {
              isa: 'PBXNativeTarget',
              name: 'Project',
              buildPhases: [
                {
                  value: 'random-build-phase',
                },
              ],
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase files are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            Project: {
              isa: 'PBXNativeTarget',
              name: 'Project',
              buildPhases: [
                {
                  value: 'build-phase-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: undefined,
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase has no files', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(noFilesInTargetProjectPath);

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('Project');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase with files', () => {
        let xcodeProject: XcodeProject;

        beforeEach(() => {
          xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            'some-target': {
              isa: 'PBXNativeTarget',
              name: 'some-target',
              buildPhases: [
                {
                  value: 'build-phase-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [
                {
                  value: 'file-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXBuildFile = {
            'file-key': {
              isa: 'PBXBuildFile',
              fileRef: 'file-ref-key',
            },
          };
        });

        describe('build file objects are not defined', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXBuildFile = undefined;

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('build file object is not found', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXBuildFile = {};

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('build file object is invalid', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXBuildFile = {
              'file-key': 'invalid-object',
            };

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('file reference is missing', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXBuildFile = {
              'file-key': {
                isa: 'PBXBuildFile',
              },
            };

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('file reference is invalid', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXFileReference = {
              'file-ref-key': 'invalid-object',
            };

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('file reference path is missing', () => {
          it('should return empty array', () => {
            // -- Arrange --
            xcodeProject.objects.PBXFileReference = {
              'file-ref-key': {
                isa: 'PBXFileReference',
                path: undefined as unknown as string,
                sourceTree: 'SOURCE_ROOT',
              },
            };

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('valid file reference', () => {
          it('should return array with file path', () => {
            // -- Arrange --
            xcodeProject.objects.PBXFileReference = {
              'file-ref-key': {
                isa: 'PBXFileReference',
                path: 'test.swift',
                sourceTree: 'SOURCE_ROOT',
              },
            };

            // -- Act --
            const files = xcodeProject.getSourceFilesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([
              path.join(xcodeProject.projectBaseDir, 'test.swift'),
            ]);
          });
        });
      });

      describe('synchronized root groups', () => {
        it('should handle missing fileSystemSynchronizedGroups', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            'some-target': {
              isa: 'PBXNativeTarget',
              name: 'some-target',
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });

        it('should handle empty fileSystemSynchronizedGroups', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            'some-target': {
              isa: 'PBXNativeTarget',
              name: 'some-target',
              fileSystemSynchronizedGroups: [],
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });

        it('should handle invalid synchronized root group', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            'some-target': {
              isa: 'PBXNativeTarget',
              name: 'some-target',
              fileSystemSynchronizedGroups: [
                {
                  value: 'invalid-group',
                },
              ],
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });

        it('should handle synchronized root group with missing path', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXNativeTarget = {
            'some-target': {
              isa: 'PBXNativeTarget',
              name: 'some-target',
              fileSystemSynchronizedGroups: [
                {
                  value: 'group-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXFileSystemSynchronizedRootGroup = {
            'group-key': {
              isa: 'PBXFileSystemSynchronizedRootGroup',
              path: undefined as unknown as string,
              sourceTree: 'SOURCE_ROOT',
            },
          };

          // -- Act --
          const files = xcodeProject.getSourceFilesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });
    });

    describe('findFilesInBuildPhase', () => {
      describe('when build phase is not found', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = undefined;

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase files are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: undefined,
            },
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase files are empty', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [],
            },
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase file is a comment', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': 'this is a comment',
          };

          // Smoke test to ensure native target is defined
          expect(nativeTarget).toBeDefined();

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase file is not found', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [],
            },
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase file reference is a comment', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [
                {
                  value: 'file-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXBuildFile = {
            'file-key': {
              isa: 'PBXBuildFile',
              fileRef: 'file-ref-key',
            },
          };
          xcodeProject.objects.PBXFileReference = {
            'file-ref-key': 'this is a comment',
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build phase file reference has no path', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [
                {
                  value: 'file-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXBuildFile = {
            'file-key': {
              isa: 'PBXBuildFile',
              fileRef: 'file-ref-key',
            },
          };
          xcodeProject.objects.PBXFileReference = {
            'file-ref-key': {
              isa: 'PBXFileReference',
              path: undefined as unknown as string,
              sourceTree: 'SOURCE_ROOT',
            },
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when file reference path contains doublequotes', () => {
        it('should be removed', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {
            'build-phase-key': {
              isa: 'PBXSourcesBuildPhase',
              files: [
                {
                  value: 'file-key',
                },
              ],
            },
          };
          xcodeProject.objects.PBXBuildFile = {
            'file-key': {
              isa: 'PBXBuildFile',
              fileRef: 'file-ref-key',
            },
          };
          xcodeProject.objects.PBXFileReference = {
            'file-ref-key': {
              isa: 'PBXFileReference',
              path: '"path/with/quotes.swift"',
              sourceTree: 'SOURCE_ROOT',
            },
          };

          // -- Act --
          const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

          // -- Assert --
          expect(files).toEqual([
            path.join(xcodeProject.projectBaseDir, 'path/with/quotes.swift'),
          ]);
        });
      });

      it('should return all files in build phase', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
        const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
          'D4E604CC2D50CEEC00CAB00F'
        ] as PBXNativeTarget;

        // -- Act --
        const files = xcodeProject.findFilesInBuildPhase(nativeTarget);

        // -- Assert --
        expect(files).toEqual([
          path.join(xcodeProject.projectBaseDir, 'File 1-2-2.swift'),
          path.join(xcodeProject.projectBaseDir, 'File 1-2-1.swift'),
          path.join(xcodeProject.projectBaseDir, 'File 1-3-1.swift'),
          path.join(xcodeProject.projectBaseDir, 'File-1-1-2-1.swift'),
        ]);
      });
    });

    describe('findSourceBuildPhaseInTarget', () => {
      describe('when build phases are undefined', () => {
        it('should return undefined', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = undefined;

          // -- Act --
          const buildPhase =
            xcodeProject.findSourceBuildPhaseInTarget(nativeTarget);

          // -- Assert --
          expect(buildPhase).toBeUndefined();
        });
      });

      describe('when build phases are empty', () => {
        it('should return undefined', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [];

          // -- Act --
          const buildPhase =
            xcodeProject.findSourceBuildPhaseInTarget(nativeTarget);

          // -- Assert --
          expect(buildPhase).toBeUndefined();
        });
      });

      describe('when referenced build phase is not found', () => {
        it('should ignore it', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.buildPhases = [
            {
              value: 'build-phase-key',
            },
          ];
          xcodeProject.objects.PBXSourcesBuildPhase = {};

          // -- Act --
          const buildPhase =
            xcodeProject.findSourceBuildPhaseInTarget(nativeTarget);

          // -- Assert --
          expect(buildPhase).toBeUndefined();
        });
      });

      describe('when referenced build phase is found', () => {
        it('should return the build phase', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;

          // -- Act --
          const buildPhase =
            xcodeProject.findSourceBuildPhaseInTarget(nativeTarget);

          // -- Assert --
          expect(buildPhase).toEqual({
            isa: 'PBXSourcesBuildPhase',
            files: [],
            buildActionMask: 2147483647,
            runOnlyForDeploymentPostprocessing: 0,
          });
        });
      });
    });

    describe('findFilesInSynchronizedRootGroups', () => {
      describe('when synchronized root groups are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.fileSystemSynchronizedGroups = undefined;

          // -- Act --
          const files =
            xcodeProject.findFilesInSynchronizedRootGroups(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when synchronized root groups are empty', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          nativeTarget.fileSystemSynchronizedGroups = [];

          // -- Act --
          const files =
            xcodeProject.findFilesInSynchronizedRootGroups(nativeTarget);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when synchronized root groups are not found', () => {
        it('should ignore files in them', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);
          const nativeTarget = xcodeProject.objects.PBXNativeTarget?.[
            'D4E604CC2D50CEEC00CAB00F'
          ] as PBXNativeTarget;
          // Add an invalid group reference to the native target
          nativeTarget.fileSystemSynchronizedGroups = [
            ...(nativeTarget.fileSystemSynchronizedGroups || []),
            {
              value: 'invalid-group-key',
            },
          ];

          // -- Act --
          const files =
            xcodeProject.findFilesInSynchronizedRootGroups(nativeTarget);

          // -- Assert --
          expect(files).toEqual([
            path.join(xcodeProject.projectBaseDir, 'Sources/MainApp.swift'),
            path.join(
              xcodeProject.projectBaseDir,
              'Sources/Subfolder 1/ContentView.swift',
            ),
            path.join(
              xcodeProject.projectBaseDir,
              'Sources/Subfolder 2/File.swift',
            ),
          ]);
        });
      });
    });

    describe('getProjectFiles', () => {
      describe('when no groups in project', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXGroup = undefined;

          // -- Act --
          const files = xcodeProject.getProjectFiles();

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when main group not found', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const project = xcodeProject.objects.PBXProject?.[
            'D4E604C52D50CEEC00CAB00F'
          ] as PBXProject;
          if (project) {
            delete project.mainGroup;
          }

          // -- Act --
          const files = xcodeProject.getProjectFiles();

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when main group found', () => {
        it('should return array of file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);

          // -- Act --
          const files = xcodeProject.getProjectFiles();

          // -- Assert --
          expect(files).toEqual([
            {
              name: 'MainApp.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Sources/MainApp.swift',
              ),
            },
            {
              name: 'ContentView.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Sources/Subfolder 1/ContentView.swift',
              ),
            },
            {
              key: 'D4E604CD2D50CEEC00CAB00F',
              name: 'Project.app',
              path: path.join(xcodeProject.projectBaseDir, 'Project.app'),
            },
          ]);
        });
      });

      describe('when folders are synchronized', () => {
        it('should return array of file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(projectWithSynchronizedFolders);

          // -- Act --
          const files = xcodeProject.getProjectFiles();

          // -- Assert --
          expect(files).toEqual([
            {
              key: 'D45896B92D8D705300817636',
              name: 'File 1-3-1.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Group 1/Group 1/Subgroup 1-2/Group Reference 1-3/File 1-3-1.swift',
              ),
            },
            {
              key: 'D45896B52D8D6F3F00817636',
              name: 'File 1-2-1.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Group 1/Group 1/Subgroup 1-2/File 1-2-1.swift',
              ),
            },
            {
              key: 'D45896B62D8D6F5800817636',
              name: 'File 1-2-2.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Group 1/Group 1/Subgroup 1-2/File 1-2-2.swift',
              ),
            },
            {
              name: 'File-1-1-1-1.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Group 1/Subgroup 1-1/Subfolder 1-1-1/File-1-1-1-1.swift',
              ),
            },
            {
              key: 'D45896AF2D8D6EEC00817636',
              name: 'File-1-1-2-1.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Group 1/Subgroup 1-1/Subgroup 1-1-2/File-1-1-2-1.swift',
              ),
            },
            {
              name: 'MainApp.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Sources/MainApp.swift',
              ),
            },
            {
              name: 'ContentView.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Sources/Subfolder 1/ContentView.swift',
              ),
            },
            {
              name: 'File.swift',
              path: path.join(
                xcodeProject.projectBaseDir,
                'Sources/Subfolder 2/File.swift',
              ),
            },
            {
              key: 'D4E604CD2D50CEEC00CAB00F',
              name: 'Project.app',
              path: path.join(xcodeProject.projectBaseDir, 'Project.app'),
            },
          ]);
        });
      });
    });

    describe('getFilesInGroup', () => {
      describe('when igroup has undefined children', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            isa: 'PBXGroup',
            children: undefined,
            path: '',
          };

          // -- Act --
          const files = xcodeProject.getFilesInGroup(
            group,
            xcodeProject.projectPath,
          );

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when group has no children', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            isa: 'PBXGroup',
          };

          // -- Act --
          const files = xcodeProject.getFilesInGroup(
            group,
            xcodeProject.projectPath,
          );

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when group child is file reference', () => {
        const group: PBXGroup = {
          isa: 'PBXGroup',
          children: [
            {
              value: 'D4E604CD2D50CEEC00CAB00F',
            },
          ],
          path: '',
        };

        describe('when project file references are undefined', () => {
          it('should return empty array', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            xcodeProject.objects.PBXFileReference = undefined;

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when file reference is string', () => {
          it('should be ignored', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            const group: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'D4E604CD2D50CEEC00CAB00F_comment',
                },
              ],
              path: '',
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when file reference path is undefined', () => {
          it('should return empty array', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            xcodeProject.objects.PBXFileReference = {
              D4E604CD2D50CEEC00CAB00F: {
                isa: 'PBXFileReference',
                path: undefined as unknown as string,
                sourceTree: 'SOURCE_ROOT',
              },
            };
            const group: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'D4E604CD2D50CEEC00CAB00F',
                },
              ],
              path: '',
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when the file reference path contains quotes', () => {
          it('should return array of escaped paths', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            xcodeProject.objects.PBXFileReference = {
              D4E604CD2D50CEEC00CAB00F: {
                isa: 'PBXFileReference',
                path: '"some/path/to/file.swift"',
                sourceTree: 'SOURCE_ROOT',
              },
            };
            const group: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'D4E604CD2D50CEEC00CAB00F',
                },
              ],
              path: '',
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([
              {
                key: 'D4E604CD2D50CEEC00CAB00F',
                name: 'some/path/to/file.swift',
                path: path.join(
                  xcodeProject.projectPath,
                  'some/path/to/file.swift',
                ),
              },
            ]);
          });
        });

        it('should return array of paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXFileReference = {
            D4E604CD2D50CEEC00CAB00F: {
              isa: 'PBXFileReference',
              path: '"some/path/to/file.swift"',
              sourceTree: 'SOURCE_ROOT',
            },
          };
          const group: PBXGroup = {
            isa: 'PBXGroup',
            children: [
              {
                value: 'D4E604CD2D50CEEC00CAB00F',
              },
            ],
            path: '',
          };

          // -- Act --
          const files = xcodeProject.getFilesInGroup(
            group,
            xcodeProject.projectPath,
          );

          // -- Assert --
          expect(files).toEqual([
            {
              key: 'D4E604CD2D50CEEC00CAB00F',
              name: 'some/path/to/file.swift',
              path: path.join(
                xcodeProject.projectPath,
                'some/path/to/file.swift',
              ),
            },
          ]);
        });
      });

      describe('when group child is group reference', () => {
        const group: PBXGroup = {
          isa: 'PBXGroup',
          children: [
            {
              value: 'D4E604C42D50CEEC00CAB00F',
            },
          ],
          path: '',
        };

        describe('when project groups are undefined', () => {
          it('should return empty array', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            xcodeProject.objects.PBXGroup = undefined;

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when group is not found', () => {
          it('should return empty array', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            xcodeProject.objects.PBXGroup = {};

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when group is string', () => {
          it('should be ignored', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            const group: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'D4E604CE2D50CEEC00CAB00F_comment',
                },
              ],
              path: '',
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectPath,
            );

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when group path is empty', () => {
          it('should use parent group path', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            const mainGroup: PBXGroup = {
              isa: 'PBXGroup',
              path: 'main-group-path',
              children: [
                {
                  value: 'sub-group-ref',
                },
                {
                  value: 'main-file-ref',
                },
              ],
            };
            const subGroup: PBXGroup = {
              isa: 'PBXGroup',
              path: '',
              children: [
                {
                  value: 'file-ref-1',
                },
                {
                  value: 'file-ref-2',
                },
              ],
            };
            xcodeProject.objects.PBXGroup = {
              'main-group-ref': mainGroup,
              'sub-group-ref': subGroup,
            };
            xcodeProject.objects.PBXFileReference = {
              'main-file-ref': {
                isa: 'PBXFileReference',
                path: 'main-file-path',
                sourceTree: '<group>',
              },
              'file-ref-1': {
                isa: 'PBXFileReference',
                path: 'file-path-1',
                sourceTree: '<group>',
              },
              'file-ref-2': {
                isa: 'PBXFileReference',
                path: 'file-path-2',
                sourceTree: '<group>',
              },
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              mainGroup,
              xcodeProject.projectBaseDir,
            );

            // -- Assert --
            expect(files).toEqual([
              {
                key: 'file-ref-1',
                name: 'file-path-1',
                path: path.join(xcodeProject.projectBaseDir, 'file-path-1'),
              },
              {
                key: 'file-ref-2',
                name: 'file-path-2',
                path: path.join(xcodeProject.projectBaseDir, 'file-path-2'),
              },
              {
                key: 'main-file-ref',
                name: 'main-file-path',
                path: path.join(xcodeProject.projectBaseDir, 'main-file-path'),
              },
            ]);
          });
        });

        describe('when group reference has path', () => {
          it('should prepend the path to the file paths', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(singleTargetProjectPath);
            const group: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'sub-group',
                },
                {
                  value: 'main-file',
                },
              ],
              path: '',
            };
            const subgroup: PBXGroup = {
              isa: 'PBXGroup',
              children: [
                {
                  value: 'file-at-path-1',
                },
                {
                  value: 'file-at-path-2',
                },
              ],
              path: '"subgroup-path"',
            };
            xcodeProject.objects.PBXGroup = {
              'main-group': group,
              'sub-group': subgroup,
            };
            xcodeProject.objects.PBXFileReference = {
              'main-file': {
                isa: 'PBXFileReference',
                path: '"main-file.swift"',
                sourceTree: '<group>',
              },
              'file-at-path-1': {
                isa: 'PBXFileReference',
                path: '"file1.swift"',
                sourceTree: '<group>',
              },
              'file-at-path-2': {
                isa: 'PBXFileReference',
                path: '"file2.swift"',
                sourceTree: '<group>',
              },
            };

            // -- Act --
            const files = xcodeProject.getFilesInGroup(
              group,
              xcodeProject.projectBaseDir,
            );

            // -- Assert --
            expect(files).toEqual([
              {
                key: 'file-at-path-1',
                name: 'file1.swift',
                path: path.join(
                  xcodeProject.projectBaseDir,
                  'subgroup-path',
                  'file1.swift',
                ),
              },
              {
                key: 'file-at-path-2',
                name: 'file2.swift',
                path: path.join(
                  xcodeProject.projectBaseDir,
                  'subgroup-path',
                  'file2.swift',
                ),
              },
              {
                key: 'main-file',
                name: 'main-file.swift',
                path: path.join(xcodeProject.projectBaseDir, 'main-file.swift'),
              },
            ]);
          });
        });

        it('should return array of file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            isa: 'PBXGroup',
          };
          const subgroup: PBXGroup = {
            isa: 'PBXGroup',
            children: [
              {
                value: 'file-at-path',
              },
            ],
          };
          const file: PBXFileReference = {
            isa: 'PBXFileReference',
            path: '"some/file/at/path.swift"',
            sourceTree: '<group>',
          };
          xcodeProject.objects.PBXGroup = {
            'main-group': group,
            'sub-group': subgroup,
          };
          xcodeProject.objects.PBXFileReference = {
            'file-at-path': file,
          };

          // -- Act --
          const files = xcodeProject.getFilesInGroup(
            group,
            xcodeProject.projectPath,
          );

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('group child is not a file reference or group', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXGroup = {};
          xcodeProject.objects.PBXFileReference = {};
          const group: PBXGroup = {
            isa: 'PBXGroup',
            children: [
              {
                value: 'random-key',
              },
            ],
            path: '',
          };

          // -- Act --
          const files = xcodeProject.getFilesInGroup(
            group,
            xcodeProject.projectPath,
          );

          // -- Assert --
          expect(files).toEqual([]);
        });
      });
    });

    describe('getFilesInSynchronizedRootGroup', () => {
      let dirPath: string;

      beforeEach(() => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcode-test-'));
        dirPath = path.join(tempDir, 'some/path/to/directory');
        fs.mkdirSync(dirPath, { recursive: true });
      });

      describe('when group path is undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const group: PBXFileSystemSynchronizedRootGroup = {
            isa: 'PBXFileSystemSynchronizedRootGroup',
            // Group path is expected to be set, therefore typing is non-nullable.
            // This test is to ensure that we handle the edge case where the group path is not set.
            path: undefined as unknown as string,
            sourceTree: 'SOURCE_ROOT',
          };
          const parentGroupPath = dirPath;

          // -- Act --
          const files = XcodeProject.getFilesInSynchronizedRootGroup(
            group,
            parentGroupPath,
          );

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      it('should return array of resolved file paths', () => {
        // -- Arrange --
        const group: PBXFileSystemSynchronizedRootGroup = {
          isa: 'PBXFileSystemSynchronizedRootGroup',
          path: 'some/path/to/group',
          sourceTree: 'SOURCE_ROOT',
        };
        const parentGroupPath = dirPath;

        fs.mkdirSync(path.join(dirPath, 'some/path/to/group/nested'), {
          recursive: true,
        });
        const file1 = path.join(dirPath, 'some/path/to/group/file1.swift');
        fs.writeFileSync(file1, 'content');
        const file2 = path.join(
          dirPath,
          'some/path/to/group/nested/file2.swift',
        );
        fs.writeFileSync(file2, 'content');

        // -- Act --
        const files = XcodeProject.getFilesInSynchronizedRootGroup(
          group,
          parentGroupPath,
        );

        // -- Assert --
        expect(files).toEqual([
          {
            name: 'file1.swift',
            path: file1,
          },
          {
            name: 'file2.swift',
            path: file2,
          },
        ]);
      });

      describe('group path contains quotes', () => {
        it('should read the path without quotes', () => {
          // -- Arrange --
          const group: PBXFileSystemSynchronizedRootGroup = {
            isa: 'PBXFileSystemSynchronizedRootGroup',
            path: '"some/path/to/group"',
            sourceTree: 'SOURCE_ROOT',
          };
          const parentGroupPath = dirPath;

          fs.mkdirSync(path.join(dirPath, 'some/path/to/group/nested'), {
            recursive: true,
          });
          const file1 = path.join(dirPath, 'some/path/to/group/file1.swift');
          fs.writeFileSync(file1, 'content');

          // -- Act --
          const files = XcodeProject.getFilesInSynchronizedRootGroup(
            group,
            parentGroupPath,
          );

          // -- Assert --
          expect(files).toEqual([
            {
              name: 'file1.swift',
              path: file1,
            },
          ]);
        });
      });
    });

    describe('getFilesInDirectoryTree', () => {
      describe('when directory does not exist', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const dirPath = 'some/path/to/directory';

          // -- Act --
          const files = XcodeProject.getFilesInDirectoryTree(dirPath);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('when directory exists', () => {
        let dirPath: string;

        beforeEach(() => {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcode-test-'));
          dirPath = path.join(tempDir, 'some/path/to/directory');
          fs.mkdirSync(dirPath, { recursive: true });
        });

        it('should return array of file paths', () => {
          // -- Arrange --
          const file1 = path.join(dirPath, 'file1.swift');
          fs.writeFileSync(file1, 'content');
          const file2 = path.join(dirPath, 'file2.swift');
          fs.writeFileSync(file2, 'content');

          // -- Act --
          const files = XcodeProject.getFilesInDirectoryTree(dirPath);

          // -- Assert --
          expect(files).toEqual([
            {
              name: 'file1.swift',
              path: file1,
            },
            {
              name: 'file2.swift',
              path: file2,
            },
          ]);
        });

        describe('when there are no files', () => {
          it('should return empty array', () => {
            // -- Arrange --
            const tempDir = fs.mkdtempSync(
              path.join(os.tmpdir(), 'xcode-test-'),
            );
            const emptyDirPath = path.join(tempDir, 'some/path/to/directory');
            fs.mkdirSync(emptyDirPath, { recursive: true });

            // -- Act --
            const files = XcodeProject.getFilesInDirectoryTree(emptyDirPath);

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        describe('when there are subdirectories', () => {
          it('should include files from subdirectories', () => {
            // -- Arrange --
            const subDirPath = path.join(dirPath, 'subdirectory');
            fs.mkdirSync(subDirPath, { recursive: true });
            const file1 = path.join(dirPath, 'file1.swift');
            fs.writeFileSync(file1, 'content');
            const file2 = path.join(subDirPath, 'file2.swift');
            fs.writeFileSync(file2, 'content');

            // -- Act --
            const files = XcodeProject.getFilesInDirectoryTree(dirPath);

            // -- Assert --
            expect(files).toEqual([
              {
                name: 'file1.swift',
                path: file1,
              },
              {
                name: 'file2.swift',
                path: file2,
              },
            ]);
          });
        });

        describe('when there are hidden files', () => {
          it('should ignore them', () => {
            // -- Arrange --
            const file1 = path.join(dirPath, '.hidden.swift');
            fs.writeFileSync(file1, 'content');

            // -- Act --
            const files = XcodeProject.getFilesInDirectoryTree(dirPath);

            // -- Assert --
            expect(files).toEqual([]);
          });
        });
      });
    });
  });
});
