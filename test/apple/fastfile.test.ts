import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addSentryToFastlane,
  exportForTesting,
  fastFile,
} from '../../src/apple/fastlane';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

describe('fastlane', () => {
  beforeEach(() => {
    jest.spyOn(clack.log, 'warn').mockImplementation();
    jest.spyOn(clack, 'select').mockResolvedValue(undefined);
  });

  describe('#fastFile', () => {
    describe('file exists', () => {
      it('should return path', () => {
        // -- Arrange --
        const { fastlaneDir, projectPath } = createFastlaneDir();
        const fastfile = createFastfile(fastlaneDir, 'lane :test do');

        // -- Act --
        const result = fastFile(projectPath);

        // -- Assert --
        expect(result).toBe(fastfile);
      });
    });

    describe('file does not exist', () => {
      it('should return null', () => {
        // -- Arrange --
        const { projectPath } = createFastlaneDir();
        // do not create Fastfile

        // -- Act --
        const result = fastFile(projectPath);

        // -- Assert --
        expect(result).toBeNull();
      });
    });
  });

  describe('#findIOSPlatform', () => {
    describe('platform block detection', () => {
      const variations: {
        name: string;
        content: string;
        expected: { index: number; length: number };
      }[] = [
        {
          name: 'no platform',
          content: 'lane :test do\nend',
          expected: { index: 0, length: 17 },
        },
        {
          name: 'platform is ios',
          content: 'platform: ios\nlane :test do\nend',
          expected: { index: 0, length: 31 },
        },
        {
          name: 'platform is ios and other platform',
          content: 'platform: ios\nend\nplatform: android\nlane :test do\nend',
          expected: { index: 0, length: 53 },
        },
      ];

      for (const variation of variations) {
        describe(`${variation.name}`, () => {
          it('should return null', () => {
            // -- Act --
            const result = exportForTesting.findIOSPlatform(variation.content);

            // -- Assert --
            expect(result).toEqual(variation.expected);
          });
        });
      }
    });

    describe('platform block not found', () => {
      it('should return full content', () => {
        // -- Arrange --
        const content = `
        lane :test do
          puts 'Hello, world!'
        end`;

        // -- Act --
        const result = exportForTesting.findIOSPlatform(content);

        // -- Assert --
        expect(result).toEqual({ index: 0, length: 65 });
      });
    });

    describe('invalid platform block', () => {
      it('should return null', () => {
        // -- Arrange --
        // platform block is not opened with `do`
        const content = `
platform :ios\n
  lane :test do
    puts 'Hello, world!'
  end
end
`;

        // -- Act --
        const result = exportForTesting.findIOSPlatform(content);

        // -- Assert --
        expect(result).toBeNull();
      });
    });

    describe('platform block is not closed', () => {
      it('should return null', () => {
        // -- Arrange --
        const content = `
platform :ios do
  lane :test do
    puts 'Hello, world!'
  end
`;

        // -- Act --
        const result = exportForTesting.findIOSPlatform(content);

        // -- Assert --
        expect(result).toBeNull();
      });
    });

    describe('multiple platforms detected', () => {
      it('should return block with ios platform', () => {
        // -- Arrange --
        const content = `
fastlane_version '2.53.1'

before_all do
  ensure_git_branch
  ensure_git_status_clean
  git_pull
end

platform :ios do
   # iOS Lanes
end

platform :android do
  # Android Lanes
end
`;
        // -- Act --
        const result = exportForTesting.findIOSPlatform(content);

        // -- Assert --
        expect(result).toEqual({ index: 121, length: 15 });
      });
    });
  });

  describe('#findLanes', () => {
    describe('lanes detection', () => {
      describe('valid cases', () => {
        const variations: {
          name: string;
          content: string;
          expected: { index: number; length: number; name: string }[] | null;
        }[] = [
          {
            name: 'single lane',
            content: `
  lane :test do
    puts 'Hello, world!'
  end
`,
            expected: [{ index: 17, length: 25, name: 'test' }],
          },
          {
            name: 'multiple lanes',
            content: `
  lane :test do
    puts 'Hello, world!'
  end
  lane :test2 do
    puts 'Hello, world!'
  end`,
            expected: [
              { index: 17, length: 25, name: 'test' },
              { index: 65, length: 25, name: 'test2' },
            ],
          },
        ];

        for (const variation of variations) {
          describe(`${variation.name}`, () => {
            it('should return lanes', () => {
              // -- Act --
              const result = exportForTesting.findLanes(variation.content);

              // -- Assert --
              expect(result).toEqual(variation.expected);
            });
          });
        }
      });

      describe('invalid cases', () => {
        describe('lane is not indented', () => {
          it('should return null', () => {
            // -- Arrange --
            const content = `lane :test do\nend`;

            // -- Act --
            const result = exportForTesting.findLanes(content);

            // -- Assert --
            expect(result).toBeNull();
          });
        });

        describe('lane is not closed', () => {
          it('should return null', () => {
            // -- Arrange --
            const content = `  lane :test do\n`;

            // -- Act --
            const result = exportForTesting.findLanes(content);

            // -- Assert --
            expect(result).toBeNull();
          });
        });
      });
    });
  });

  describe('#addSentryToLane', () => {
    describe('sentry_cli is not present', () => {
      it('should return original content', () => {
        // -- Arrange --
        const content = `
platform :ios do
  lane :test do
    puts 'Hello, world!'
  end
end
`;
        const lane = { index: 34, length: 25, name: 'test' };

        // -- Act --
        const result = exportForTesting.addSentryToLane(
          content,
          lane,
          'test-org',
          'test-project',
        );

        // -- Assert --
        expect(result).toBe(`
platform :ios do
  lane :test do
    puts 'Hello, world!'

    sentry_cli(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )
  end
end
`);
      });
    });

    describe('sentry_cli is present', () => {
      it('should return updated content', () => {
        // -- Arrange --
        const content = `
platform :ios do
  lane :test do
    puts 'Hello, world!'

    sentry_cli(org_slug: 'test-org', project_slug: 'test-project')
  end
end
`;
        const lane = { index: 34, length: 92, name: 'test' };

        // -- Act --
        const result = exportForTesting.addSentryToLane(
          content,
          lane,
          'test-org',
          'test-project',
        );

        // -- Assert --
        expect(result).toBe(
          `
platform :ios do
  lane :test do
    puts 'Hello, world!'

    sentry_cli(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )
  end
end
`,
        );
      });
    });
  });

  describe('#addSentryToFastlane', () => {
    const org = 'test-org';
    const project = 'test-project';

    describe('Fastfile not found', () => {
      it('should return false', async () => {
        // -- Arrange --
        const { projectPath } = createFastlaneDir();
        const fastfilePath = path.join(projectPath, 'Fastfile');
        // do not create Fastfile

        // -- Act --
        const result = await addSentryToFastlane(projectPath, org, project);

        // -- Assert --
        expect(result).toBe(false);
        expect(fs.existsSync(fastfilePath)).toBe(false);
      });
    });

    describe('platform not found', () => {
      it('should return false', async () => {
        // -- Arrange --
        const { fastlaneDir, projectPath } = createFastlaneDir();
        const fastfilePath = createFastfile(
          fastlaneDir,
          `
platform :ios
  lane :test do
    puts 'Hello, world!'
  end
end
`,
        );
        const originalContent = fs.readFileSync(fastfilePath, 'utf8');

        // -- Act --
        const result = await addSentryToFastlane(projectPath, org, project);

        // -- Assert --
        expect(result).toBe(false);
        expect(fs.readFileSync(fastfilePath, 'utf8')).toBe(originalContent);
      });
    });

    describe('no lanes', () => {
      it('should return false', async () => {
        // -- Arrange --
        const { fastlaneDir, projectPath } = createFastlaneDir();
        createFastfile(fastlaneDir, `platform :ios`);

        // -- Act --
        const result = await addSentryToFastlane(projectPath, org, project);

        // -- Assert --
        expect(result).toBe(false);
      });

      it('should warn user', async () => {
        // -- Arrange --
        const { fastlaneDir, projectPath } = createFastlaneDir();
        createFastfile(fastlaneDir, `platform :ios`);

        // -- Act --
        const result = await addSentryToFastlane(projectPath, org, project);

        // -- Assert --
        expect(result).toBe(false);
        expect(clack.log.warn).toHaveBeenCalledWith(
          'No suitable lanes in your Fastfile.',
        );
      });
    });

    describe('single lane', () => {
      it('should return true', async () => {
        // -- Arrange --
        const { fastlaneDir, projectPath } = createFastlaneDir();
        const fastfilePath = createFastfile(
          fastlaneDir,
          `
platform :ios do
  lane :test do
    puts 'Hello, world!'
  end   
end
`,
        );

        // -- Act --
        const result = await addSentryToFastlane(projectPath, org, project);

        // -- Assert --
        expect(result).toBe(true);
        expect(fs.readFileSync(fastfilePath, 'utf8')).toBe(
          `
platform :ios do
  lane :test do
    puts 'Hello, world!'

    sentry_cli(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )
  end   
end
`,
        );
      });
    });

    describe('multiple lanes', () => {
      let fastfilePath: string;
      let projectPath: string;
      let originalContent: string;

      beforeEach(() => {
        const createdFastlaneDir = createFastlaneDir();
        projectPath = createdFastlaneDir.projectPath;
        fastfilePath = createFastfile(
          createdFastlaneDir.fastlaneDir,
          `platform :ios do
  lane :test do
    puts 'Hello, world!'
  end   

  lane :beta do
    puts 'Beta lane'
  end
end
`,
        );
      });

      describe('no lane selected', () => {
        it('should not modify Fastfile', async () => {
          // -- Arrange --
          originalContent = fs.readFileSync(fastfilePath, 'utf8');
          jest.spyOn(clack, 'select').mockResolvedValue(undefined);

          // -- Act --
          const result = await addSentryToFastlane(projectPath, org, project);

          // -- Assert --
          expect(result).toBe(false);
          expect(fs.readFileSync(fastfilePath, 'utf8')).toBe(originalContent);
        });
      });

      describe('lane selected', () => {
        it('should modify only selected lane', async () => {
          // -- Arrange --
          jest.spyOn(clack, 'select').mockResolvedValue({
            value: 'beta',
            index: 1,
          });

          // -- Act --
          const result = await addSentryToFastlane(projectPath, org, project);

          // -- Assert --
          expect(result).toBe(true);
          expect(fs.readFileSync(fastfilePath, 'utf8')).toBe(
            `platform :ios do
  lane :test do
    puts 'Hello, world!'
  end   

  lane :beta do
    puts 'Beta lane'

    sentry_cli(
      org_slug: 'test-org',
      project_slug: 'test-project',
      include_sources: true
    )
  end
end
`,
          );
          expect(clack.select).toHaveBeenCalledWith({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            maxItems: expect.any(Number),
            message: 'Select lane to add Sentry to:',
            options: [
              { value: { value: 'test', index: 0 }, label: 'test' },
              { value: { value: 'beta', index: 1 }, label: 'beta' },
            ],
          });
        });
      });
    });
  });
});

function createFastlaneDir() {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'test-project'));
  const fastlaneDir = path.join(projectPath, 'fastlane');
  fs.mkdirSync(fastlaneDir, {
    recursive: true,
  });
  return { fastlaneDir, projectPath };
}

function createFastfile(fastlaneDir: string, content: string) {
  const fastfile = path.join(fastlaneDir, 'Fastfile');
  fs.writeFileSync(fastfile, content);
  return fastfile;
}
