import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  PBXFileReference,
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
  ...jest.requireActual('node:fs'),
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
  '../../e2e-tests/test-applications/apple',
);
const damagedProjectPath = path.join(
  appleProjectsPath,
  'damaged-missing-configuration-list/Project.xcodeproj/project.pbxproj',
);
const noTargetsProjectPath = path.join(
  appleProjectsPath,
  'no-targets/Project.xcodeproj/project.pbxproj',
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
  });

  describe('filesForTarget', () => {
    describe('targets are undefined', () => {
      it('should return undefined', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXNativeTarget = undefined;

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

        // -- Assert --
        expect(files).toBeUndefined();
      });
    });

    describe('target not found', () => {
      it('should return undefined', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);

        // -- Act --
        const files = xcodeProject.filesForTarget('NonExistentTarget');

        // -- Assert --
        expect(files).toBeUndefined();
      });
    });

    describe('target build phases are undefined', () => {
      it('should return undefined', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXNativeTarget = {
          Project: {
            name: 'Project',
            buildPhases: undefined,
          },
        };

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

        // -- Assert --
        expect(files).toBeUndefined();
      });
    });

    describe('build phases are undefined', () => {
      it('should return undefined', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXNativeTarget = {
          Project: {
            name: 'Project',
            buildPhases: undefined,
          },
        };
        xcodeProject.objects.PBXSourcesBuildPhase = undefined;

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

        // -- Assert --
        expect(files).toBeUndefined();
      });
    });

    describe('referenced build phase is undefined', () => {
      it('should return undefined', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXNativeTarget = {
          Project: {
            name: 'Project',
            buildPhases: [
              {
                value: 'random-build-phase',
              },
            ],
          },
        };

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

        // -- Assert --
        expect(files).toBeUndefined();
      });
    });

    describe('build phase files are undefined', () => {
      it('should return empty array', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXNativeTarget = {
          Project: {
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
            files: undefined,
          },
        };

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

        // -- Assert --
        expect(files).toEqual([]);
      });
    });

    describe('build phase has no files', () => {
      it('should return empty array', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);

        // -- Act --
        const files = xcodeProject.filesForTarget('Project');

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
        xcodeProject.files = [
          {
            key: 'file-ref-key',
            path: 'file-path',
          },
        ];
      });

      describe('build file objects are not defined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          xcodeProject.objects.PBXBuildFile = undefined;

          // -- Act --
          const files = xcodeProject.filesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build file object is not found', () => {
        it('should return empty array', () => {
          // -- Arrange --
          xcodeProject.objects.PBXBuildFile = {};

          // -- Act --
          const files = xcodeProject.filesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('build file object exists', () => {
        describe('file reference is undefined', () => {
          it('should ignore the file', () => {
            // -- Arrange --
            xcodeProject.files = [];

            // -- Act --
            const files = xcodeProject.filesForTarget('some-target');

            // -- Assert --
            expect(files).toEqual([]);
          });
        });

        it('should return array of file paths', () => {
          // -- Act --
          const files = xcodeProject.filesForTarget('some-target');

          // -- Assert --
          expect(files).toEqual([
            path.join(
              appleProjectsPath,
              'spm-swiftui-single-target',
              'file-path',
            ),
          ]);
        });
      });
    });
  });

  describe('projectFiles', () => {
    describe('no groups in project', () => {
      it('should return empty array', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXGroup = undefined;

        // -- Act --
        const files = xcodeProject.projectFiles();

        // -- Assert --
        expect(files).toEqual([]);
      });
    });

    describe('main group not found', () => {
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
        const files = xcodeProject.projectFiles();

        // -- Assert --
        expect(files).toEqual([]);
      });
    });

    describe('main group found', () => {
      it('should return array of file paths', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);

        // -- Act --
        const files = xcodeProject.projectFiles();

        // -- Assert --
        expect(files).toEqual([
          {
            key: 'D4E604CD2D50CEEC00CAB00F',
            path: 'Project.app',
          },
        ]);
      });

      it('should cache the result', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);

        // Smoke test
        expect(xcodeProject.files).toBeUndefined();

        // -- Act --
        const files = xcodeProject.projectFiles();

        // -- Assert --
        expect(xcodeProject.files).toBeDefined();
        expect(xcodeProject.files).toEqual(files);
      });
    });
  });

  describe('buildGroup', () => {
    describe('group has undefined children', () => {
      it('should return empty array', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        const group: PBXGroup = {
          children: undefined,
          path: '',
        };

        // -- Act --
        const files = xcodeProject.buildGroup(group);

        // -- Assert --
        expect(files).toEqual([]);
      });
    });

    describe('group has no children', () => {
      it('should return empty array', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        const group: PBXGroup = {};

        // -- Act --
        const files = xcodeProject.buildGroup(group);

        // -- Assert --
        expect(files).toEqual([]);
      });
    });

    describe('group child is file reference', () => {
      const group: PBXGroup = {
        children: [
          {
            value: 'D4E604CD2D50CEEC00CAB00F',
          },
        ],
        path: '',
      };

      describe('file references are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXFileReference = undefined;

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('file reference is string', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            children: [
              {
                value: 'D4E604CD2D50CEEC00CAB00F_comment',
              },
            ],
            path: '',
          };

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('file reference is valid', () => {
        it('should return array of escaped paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXFileReference = {
            D4E604CD2D50CEEC00CAB00F: {
              path: '"some/path/to/file.swift"',
            },
          };
          const group: PBXGroup = {
            children: [
              {
                value: 'D4E604CD2D50CEEC00CAB00F',
              },
            ],
            path: '',
          };

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([
            {
              key: 'D4E604CD2D50CEEC00CAB00F',
              path: 'some/path/to/file.swift',
            },
          ]);
        });
      });
    });

    describe('group child is group reference', () => {
      const group: PBXGroup = {
        children: [
          {
            value: 'D4E604C42D50CEEC00CAB00F',
          },
        ],
        path: '',
      };

      describe('groups are undefined', () => {
        it('should return empty array', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          xcodeProject.objects.PBXGroup = undefined;

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('group reference is string', () => {
        it('should return array of file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            children: [
              {
                value: 'D4E604CE2D50CEEC00CAB00F_comment',
              },
            ],
            path: '',
          };

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([]);
        });
      });

      describe('group reference is valid', () => {
        it('should return array of file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([
            {
              key: 'D4E604CD2D50CEEC00CAB00F',
              path: 'Project.app',
            },
          ]);
        });
      });

      describe('group reference has path', () => {
        it('should append the path to the file paths', () => {
          // -- Arrange --
          const xcodeProject = new XcodeProject(singleTargetProjectPath);
          const group: PBXGroup = {
            children: [
              {
                value: 'sub-group',
              },
            ],
            path: '"some/path/to/group"',
          };
          const subgroup: PBXGroup = {
            children: [
              {
                value: 'file-at-path',
              },
            ],
          };
          const file: PBXFileReference = {
            path: '"some/file/at/path.swift"',
          };
          xcodeProject.objects.PBXGroup = {
            'main-group': group,
            'sub-group': subgroup,
          };
          xcodeProject.objects.PBXFileReference = {
            'file-at-path': file,
          };

          // -- Act --
          const files = xcodeProject.buildGroup(group);

          // -- Assert --
          expect(files).toEqual([
            {
              key: 'file-at-path',
              path: 'some/file/at/path.swift',
            },
          ]);
        });
      });
    });

    describe('group child is not a file reference or group', () => {
      it('should be ignored', () => {
        // -- Arrange --
        const xcodeProject = new XcodeProject(singleTargetProjectPath);
        xcodeProject.objects.PBXGroup = {};
        xcodeProject.objects.PBXFileReference = {};
        const group: PBXGroup = {
          children: [
            {
              value: 'random-key',
            },
          ],
          path: '',
        };

        // -- Act --
        const files = xcodeProject.buildGroup(group);

        // -- Assert --
        expect(files).toEqual([]);
      });
    });
  });
});
