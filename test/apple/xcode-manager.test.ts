import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  setDebugInformationFormatAndSandbox,
  XcodeProject,
} from '../../src/apple/xcode-manager';
import { SentryProjectData } from '../../src/utils/types';
import { getRunScriptTemplate } from '../../src/apple/templates';
import { PBXShellScriptBuildPhase, XCBuildConfiguration } from 'xcode';

jest.mock('@clack/prompts', () => ({
  default: {
    log: {
      info: jest.fn(),
      success: jest.fn(),
      step: jest.fn(),
    },
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
      let tempProjectPath: string;

      beforeEach(() => {
        // Copy the project to a temp directory to avoid modifying the original
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'update-xcode-project'),
        );
        tempProjectPath = path.resolve(tempDir, 'project.pbxproj');
        fs.copyFileSync(singleTargetProjectPath, tempProjectPath);
      });

      describe('upload symbols script', () => {
        const scriptVariants = [
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
          {
            uploadSource: undefined,
            includeHomebrewPath: true,
          },
          {
            uploadSource: undefined,
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
              const xcodeProject = new XcodeProject(tempProjectPath);
              xcodeProject.updateXcodeProject(
                projectData,
                'Project',
                true,
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
    });

    describe('setDebugInformationFormatAndSandbox', () => {
      describe('targets is undefined', () => {
        it('should not update the Xcode project', () => {
          // -- Arrange --
          const projectPath = damagedProjectPath;
          const xcodeProject = new XcodeProject(projectPath);

          // -- Act --
          setDebugInformationFormatAndSandbox(xcodeProject.project, 'Project');

          // -- Assert --
          const expectedXcodeProject = new XcodeProject(projectPath);
          expectedXcodeProject.objects.PBXNativeTarget = {};
          expectedXcodeProject.objects.XCBuildConfiguration = {};
          expectedXcodeProject.objects.XCConfigurationList = {};
          expect(xcodeProject).toEqual(expectedXcodeProject);
        });
      });

      describe('named target not found', () => {
        it('should not update the Xcode project', () => {
          // -- Arrange --
          const projectPath = singleTargetProjectPath;
          const xcodeProject = new XcodeProject(projectPath);

          // -- Act --
          setDebugInformationFormatAndSandbox(
            xcodeProject.project,
            'Invalid Target Name',
          );

          // -- Assert --
          const originalXcodeProject = new XcodeProject(projectPath);
          expect(originalXcodeProject).toEqual(xcodeProject);
        });
      });

      describe('named target found', () => {
        describe('build configurations is undefined', () => {
          it('should not update the Xcode project', () => {
            // -- Arrange --
            const projectPath = singleTargetProjectPath;
            const xcodeProject = new XcodeProject(projectPath);

            // -- Act --
            setDebugInformationFormatAndSandbox(
              xcodeProject.project,
              'Invalid Target Name',
            );

            // -- Assert --
            const originalXcodeProject = new XcodeProject(projectPath);
            expect(originalXcodeProject).toEqual(xcodeProject);
          });
        });

        describe('no build configurations found', () => {
          it('should update the Xcode project', () => {
            // -- Arrange --
            const projectPath = singleTargetProjectPath;
            const xcodeProject = new XcodeProject(projectPath);

            // -- Act --
            setDebugInformationFormatAndSandbox(
              xcodeProject.project,
              'Invalid Target Name',
            );

            // -- Assert --
            const originalXcodeProject = new XcodeProject(projectPath);
            expect(originalXcodeProject).toEqual(xcodeProject);
          });
        });

        describe('build configurations found', () => {
          const projectPath = singleTargetProjectPath;
          const debugProjectBuildConfigurationListId =
            'D4E604DA2D50CEEE00CAB00F';
          const releaseProjectBuildConfigurationListId =
            'D4E604DB2D50CEEE00CAB00F';
          const debugTargetBuildConfigurationListId =
            'D4E604DD2D50CEEE00CAB00F';
          const releaseTargetBuildConfigurationListId =
            'D4E604DE2D50CEEE00CAB00F';

          it('should update the target configuration lists', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(projectPath);

            // -- Act --
            setDebugInformationFormatAndSandbox(
              xcodeProject.project,
              'Project',
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
              expect(buildSettings.ENABLE_USER_SCRIPT_SANDBOXING).toBe('"NO"');
            }
          });

          it('should not update the project configuration lists', () => {
            // -- Arrange --
            const xcodeProject = new XcodeProject(projectPath);

            // -- Act --
            setDebugInformationFormatAndSandbox(
              xcodeProject.project,
              'Project',
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
              debugBuildConfiguration.buildSettings?.DEBUG_INFORMATION_FORMAT,
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
              releaseBuildConfiguration.buildSettings?.DEBUG_INFORMATION_FORMAT,
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
});
