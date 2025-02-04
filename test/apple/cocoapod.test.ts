import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addCocoaPods,
  podInstall,
  usesCocoaPod,
} from '../../src/apple/cocoapod';
import * as bash from '../../src/utils/bash';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

jest.mock('../../src/utils/bash');
jest.spyOn(Sentry, 'setTag').mockImplementation();
jest.spyOn(Sentry, 'captureException').mockImplementation();

const clackSpinnerMock = {
  start: jest.fn(),
  stop: jest.fn(),
  message: jest.fn(),
};

describe('cocoapod', () => {
  beforeEach(() => {
    jest.spyOn(clack, 'spinner').mockReturnValue(clackSpinnerMock);
    jest.spyOn(clack.log, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('usesCocoaPod', () => {
    describe('Podfile exists', () => {
      it('should return true', () => {
        // -- Arrange --
        const projPath = path.join(os.tmpdir(), 'test-project-with-podfile');
        fs.mkdtempSync(projPath);

        const podfile = path.join(projPath, 'Podfile');
        fs.writeFileSync(podfile, '');

        // -- Act --
        const result = usesCocoaPod(projPath);

        // -- Assert --
        expect(result).toBeTruthy();
      });
    });

    describe('Podfile does not exist', () => {
      it('should return false', () => {
        // -- Arrange --
        const projPath = path.join(os.tmpdir(), 'test-project-without-podfile');
        fs.mkdtempSync(projPath);

        // -- Act --
        const result = usesCocoaPod(projPath);

        // -- Assert --
        expect(result).toBeFalsy();
      });
    });
  });

  describe('addCocoaPods', () => {
    describe('Podfile does not exist', () => {
      it('should throw an error', async () => {
        // -- Arrange --
        const projPath = path.join(os.tmpdir(), 'test-project-without-podfile');
        fs.mkdtempSync(projPath);

        // -- Act & Assert --
        await expect(addCocoaPods(projPath)).rejects.toThrow(
          'ENOENT: no such file or directory, open',
        );
      });
    });

    describe('Podfile exists', () => {
      describe('Podfile includes Sentry pod', () => {
        const variations = [
          {
            case: 'simple',
            content: 'pod "Sentry"',
          },
          {
            case: 'with-swiftui',
            content: 'pod "SentrySwiftUI"',
          },
          {
            case: 'leading-space',
            content: '  pod "Sentry"',
          },
          {
            case: 'leading-space-and-swiftui',
            content: '  pod "SentrySwiftUI"',
          },
          {
            case: 'trailing-space',
            content: 'pod "Sentry" ',
          },
          {
            case: 'trailing-space-and-swiftui',
            content: 'pod "SentrySwiftUI" ',
          },
          {
            case: 'single-quotes',
            content: "pod 'Sentry'",
          },
          {
            case: 'double-quotes',
            content: 'pod "Sentry"',
          },
        ];
        for (const variation of variations) {
          it(`should not change the Podfile for ${variation.case}`, async () => {
            // -- Arrange --
            const projPath = path.join(os.tmpdir(), fs.mkdtempSync('project'));
            fs.mkdirSync(projPath);

            const podfile = path.join(projPath, 'Podfile');
            fs.writeFileSync(podfile, variation.content, 'utf8');

            // -- Act --
            const result = await addCocoaPods(projPath);

            // -- Assert --
            expect(result).toBeTruthy();
            expect(fs.readFileSync(podfile, 'utf8')).toBe(variation.content);
          });
        }
      });

      describe('Podfile includes no other pods', () => {
        describe('Podfile does not include use_frameworks!', () => {
          it('should not change the Podfile', async () => {
            // -- Arrange --
            const projPath = path.join(os.tmpdir(), fs.mkdtempSync('project'));
            fs.mkdirSync(projPath);

            const podfile = path.join(projPath, 'Podfile');
            fs.writeFileSync(podfile, '', 'utf8');

            // -- Act --
            const result = await addCocoaPods(projPath);

            // -- Assert --
            expect(result).toBeFalsy();
            expect(fs.readFileSync(podfile, 'utf8')).toBe('');
          });
        });

        describe('Podfile includes use_frameworks!', () => {
          it('should change the Podfile', async () => {
            // -- Arrange --
            const projPath = path.join(os.tmpdir(), fs.mkdtempSync('project'));
            fs.mkdirSync(projPath);

            const podfile = path.join(projPath, 'Podfile');
            fs.writeFileSync(podfile, `use_frameworks!`, 'utf8');

            // -- Act --
            const result = await addCocoaPods(projPath);

            // -- Assert --
            expect(result).toBeTruthy();
            expect(fs.readFileSync(podfile, 'utf8')).toBe(
              `use_frameworks!\npod 'Sentry'\n`,
            );
          });
        });
      });

      describe('Podfile includes other pods', () => {
        it('should append Sentry pod after last pod', async () => {
          // -- Arrange --
          const projPath = path.join(os.tmpdir(), fs.mkdtempSync('project'));
          fs.mkdirSync(projPath);

          const podfile = path.join(projPath, 'Podfile');
          fs.writeFileSync(podfile, 'pod "OtherPod"', 'utf8');

          // -- Act --
          const result = await addCocoaPods(projPath);

          // -- Assert --
          expect(result).toBeTruthy();
          expect(fs.readFileSync(podfile, 'utf8')).toBe(
            `pod "OtherPod"\npod 'Sentry'\n`,
          );
        });
      });
    });
  });

  describe('podInstall', () => {
    let workDir: string;

    beforeEach(() => {
      workDir = path.join(os.tmpdir(), 'test-project');
    });

    describe('any bash scripts fail', () => {
      beforeEach(() => {
        jest.spyOn(bash, 'execute').mockRejectedValue(new Error('test error'));
      });

      it('should not throw an error', async () => {
        // -- Act & Assert --
        await expect(podInstall(workDir)).resolves.not.toThrow();
      });

      it('should set tag', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(Sentry.setTag).toHaveBeenCalledWith('pods-installed', false);
      });

      it('should capture exception', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(Sentry.captureException).toHaveBeenCalledWith(
          'Sentry pod install failed.',
        );
      });

      it('should start and stop spinner', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(clackSpinnerMock.start).toHaveBeenCalledWith(
          "Running 'pod install'. This may take a few minutes...",
        );
        expect(clackSpinnerMock.stop).toHaveBeenCalledWith(
          'Failed to install pods.',
        );
      });
    });

    describe('all bash scripts work', () => {
      beforeEach(() => {
        jest.spyOn(bash, 'execute').mockResolvedValue('');
      });

      it('should call pod update and install', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(bash.execute).toHaveBeenCalledWith(
          `cd ${workDir} && pod repo update`,
        );
        expect(bash.execute).toHaveBeenCalledWith(
          `cd ${workDir} && pod install --silent`,
        );
      });

      it('should set tag', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(Sentry.setTag).toHaveBeenCalledWith('pods-installed', true);
      });

      it('should start and stop spinner', async () => {
        // -- Act --
        await podInstall(workDir);

        // -- Assert --
        expect(clackSpinnerMock.start).toHaveBeenCalledWith(
          "Running 'pod install'. This may take a few minutes...",
        );
        expect(clackSpinnerMock.stop).toHaveBeenCalledWith('Pods installed.');
      });
    });

    describe('dir not given', () => {
      it('should use current directory', async () => {
        // -- Act --
        await podInstall();

        // -- Assert --
        expect(bash.execute).toHaveBeenCalledWith(`cd . && pod repo update`);
        expect(bash.execute).toHaveBeenCalledWith(
          `cd . && pod install --silent`,
        );
      });
    });
  });
});
