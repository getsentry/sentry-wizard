import * as Sentry from '@sentry/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addCodeSnippetToProject,
  exportForTesting,
} from '../../src/apple/code-tools';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

// Test Constants
const invalidAppDelegateSwift = `func application() {}`;
const validAppDelegateSwift = `
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }
}`;
const validAppDelegateSwiftWithSentry = `
import UIKit
import Sentry


@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        SentrySDK.start { options in
            options.dsn = "https://example.com/sentry-dsn"
            options.debug = true // Enabled debug when first installing is always helpful
            // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
            // We recommend adjusting this value in production.
            options.tracesSampleRate = 1.0

            // Configure profiling. Visit https://docs.sentry.io/platforms/apple/profiling/ to learn more.
            options.configureProfiling = {
                $0.sessionSampleRate = 1 // We recommend adjusting this value in production.
                $0.lifecycle = .trace
            }

            // Uncomment the following lines to add more data to your events
            // options.attachScreenshot = true // This adds a screenshot to the error events
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")

        // Override point for customization after application launch.
        return true
    }
}`;
const invalidAppDelegateObjC = `
- (BOOL)application:(UIApplication *) {
  return NO;
}`;
const validAppDelegateObjC = `
#import "AppDelegate.h"

@interface AppDelegate ()

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    // Override point for customization after application launch.
    return YES;
}

@end`;
const validAppDelegateObjCWithSentry = `@import Sentry;

#import "AppDelegate.h"

@interface AppDelegate ()

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    [SentrySDK startWithConfigureOptions:^(SentryOptions * options) {
        options.dsn = @"https://example.com/sentry-dsn";
        options.debug = YES; // Enabled debug when first installing is always helpful
        // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
        // We recommend adjusting this value in production.
        options.tracesSampleRate = @1.0;

        // Configure profiling. Visit https://docs.sentry.io/platforms/apple/profiling/ to learn more.
        options.configureProfiling = ^(SentryProfileOptions *profiling) {
            profiling.sessionSampleRate = 1.f; // We recommend adjusting this value in production.
            profiling.lifecycle = SentryProfilingLifecycleTrace;
        };

        //Uncomment the following lines to add more data to your events
        //options.attachScreenshot = YES; //This will add a screenshot to the error events
        //options.attachViewHierarchy = YES; //This will add the view hierarchy to the error events
    }];
    //Remove the next line after confirming that your Sentry integration is working.
    [SentrySDK captureMessage:@"This app uses Sentry!"];

    // Override point for customization after application launch.
    return YES;
}

@end`;
const invalidAppDelegateSwiftUI = `
struct MyApp: App {
  var body: some Scene {
    WindowGroup { Text("Hello, world!") }
  }
}`;
const validAppDelegateSwiftUI = `
import SwiftUI

@main
struct TestApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}`;
const validAppDelegateSwiftUIWithSentry = `
import SwiftUI
import Sentry


@main
struct TestApp: App {
    init() {
        SentrySDK.start { options in
            options.dsn = "https://example.com/sentry-dsn"
            options.debug = true // Enabled debug when first installing is always helpful
            // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
            // We recommend adjusting this value in production.
            options.tracesSampleRate = 1.0

            // Configure profiling. Visit https://docs.sentry.io/platforms/apple/profiling/ to learn more.
            options.configureProfiling = {
                $0.sessionSampleRate = 1 // We recommend adjusting this value in production.
                $0.lifecycle = .trace
            };

            // Uncomment the following lines to add more data to your events
            // options.attachScreenshot = true // This adds a screenshot to the error events
            // options.attachViewHierarchy = true // This adds the view hierarchy to the error events
        }
        // Remove the next line after confirming that your Sentry integration is working.
        SentrySDK.capture(message: "This app uses Sentry! :)")
    }
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}`;

const prepareTempDir = (): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-tools-test'));
  return tempDir;
};

const prepareAppDelegateFile = (
  dir: string,
  content: string,
  ext: 'm' | 'mm' | 'swift',
): string => {
  const filePath = path.join(dir, `AppDelegate.${ext}`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
};

const dsn = 'https://example.com/sentry-dsn';

// Mock Setup

jest.mock('../../src/utils/bash');
jest.spyOn(Sentry, 'setTag').mockImplementation();
jest.spyOn(Sentry, 'captureException').mockImplementation();

// Test Suite

describe('code-tools', () => {
  beforeEach(() => {
    jest.spyOn(clack.log, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('#isAppDelegateFile', () => {
    const prepareTestFile = (
      content: string,
      ext: 'm' | 'mm' | 'swift',
    ): string => {
      const tempDir = prepareTempDir();
      return prepareAppDelegateFile(tempDir, content, ext);
    };

    describe('swift files', () => {
      describe('swift app launch regex', () => {
        describe('valid cases', () => {
          const variations: {
            name: string;
            code: string;
          }[] = [
            {
              name: 'with underscores',
              code: 'func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {',
            },
            {
              name: 'with different dictionary type',
              code: 'func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {',
            },
            {
              name: 'with extra whitespace',
              code: '  func  application  (  _  application:  UIApplication  ,   didFinishLaunchingWithOptions   launchOptions:   [  NSObject  :  AnyObject  ]?  )   ->   Bool   {  ',
            },
            {
              name: 'macOS notification variant',
              code: 'func applicationDidFinishLaunching(_ aNotification: Notification) {',
            },
            {
              name: 'macOS with extra whitespace',
              code: 'func   applicationDidFinishLaunching  (  _   aNotification:  Notification  )  {',
            },
          ];

          for (const variation of variations) {
            describe(`${variation.name}`, () => {
              it(`should return true`, () => {
                // -- Arrange --
                const filePath = prepareTestFile(variation.code, 'swift');

                // -- Act --
                const result = exportForTesting.isAppDelegateFile(filePath);

                // -- Assert --
                expect(result).toBeTruthy();
              });
            });
          }

          describe('invalid cases', () => {
            const variations: {
              name: string;
              code: string;
            }[] = [
              {
                name: 'missing application method',
                code: 'import UIKit',
              },
              {
                name: 'typo in method name',
                code: 'func applicatioM(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [NSObject: AnyObject]?) -> Bool {',
              },
              {
                name: 'garbage input',
                code: 'asdf;jk23;uas()d{',
              },
            ];

            for (const variation of variations) {
              describe(`${variation.name}`, () => {
                it('should return false', () => {
                  // -- Arrange --
                  const filePath = prepareTestFile(variation.code, 'swift');

                  // -- Act --
                  const result = exportForTesting.isAppDelegateFile(filePath);

                  // -- Assert --
                  expect(result).toBeFalsy();
                });
              });
            }
          });
        });
      });
    });

    describe('objc files', () => {
      describe('valid cases', () => {
        const variations: {
          name: string;
          code: string;
        }[] = [
          {
            name: 'basic',
            code: '- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {',
          },
          {
            name: 'with more whitespace',
            code: '-  (  BOOL )  application:  (  UIApplication  *   )   application   didFinishLaunchingWithOptions:  (  NSDictionary  *  )  launchOptions   {',
          },
        ];

        for (const variation of variations) {
          describe(`${variation.name}`, () => {
            it('should return true', () => {
              // -- Arrange --
              const filePath = prepareTestFile(variation.code, 'm');

              // -- Act --
              const result = exportForTesting.isAppDelegateFile(filePath);

              // -- Assert --
              expect(result).toBeTruthy();
            });
          });
        }
      });

      describe('invalid cases', () => {
        const variations: {
          name: string;
          code: string;
        }[] = [
          {
            name: 'missing application method',
            code: 'import UIKit',
          },
        ];

        for (const variation of variations) {
          describe(`${variation.name}`, () => {
            it('should return false', () => {
              // -- Arrange --
              const filePath = prepareTestFile(variation.code, 'm');

              // -- Act --
              const result = exportForTesting.isAppDelegateFile(filePath);

              // -- Assert --
              expect(result).toBeFalsy();
            });
          });
        }
      });
    });

    describe('swiftui files', () => {
      describe('valid cases', () => {
        const variations: {
          name: string;
          code: string;
        }[] = [
          {
            name: 'basic',
            code: '@main struct MyApp: App {',
          },
          {
            name: 'with more whitespace',
            code: '@main    struct   MyApp:   App   {',
          },
          {
            name: 'with SwiftUI namespace',
            code: '@main struct App: SwiftUI.App {',
          },
        ];

        for (const variation of variations) {
          describe(`${variation.name}`, () => {
            it('should return true', () => {
              // -- Arrange --
              const filePath = prepareTestFile(variation.code, 'swift');

              // -- Act --
              const result = exportForTesting.isAppDelegateFile(filePath);

              // -- Assert --
              expect(result).toBeTruthy();
            });
          });
        }
      });

      describe('invalid cases', () => {
        const variations: {
          name: string;
          code: string;
        }[] = [
          {
            name: 'missing @main',
            code: 'struct App: App {',
          },
          {
            name: 'missing super-type App',
            code: 'struct MyApp {',
          },
          {
            name: 'imported not from SwiftUI',
            code: '@main struct App: MySwiftyUI.App {',
          },
          {
            name: 'imported not from SwiftUI but similar',
            code: '@main struct App: MySwiftUI.App {',
          },
        ];

        for (const variation of variations) {
          describe(`${variation.name}`, () => {
            it('should return false', () => {
              // -- Arrange --
              const filePath = prepareTestFile(variation.code, 'swift');

              // -- Act --
              const result = exportForTesting.isAppDelegateFile(filePath);

              // -- Assert --
              expect(result).toBeFalsy();
            });
          });
        }
      });
    });

    describe('file not found', () => {
      it('should throw an error', () => {
        // -- Arrange --
        const invalidPath = path.join(os.tmpdir(), 'invalid-path');

        // -- Act & Assert --
        expect(() => exportForTesting.isAppDelegateFile(invalidPath)).toThrow();
      });
    });
  });

  describe('#findAppDidFinishLaunchingWithOptions', () => {
    describe('no files given', () => {
      it('should check files in directory', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();
        const filePath = prepareAppDelegateFile(
          tempDir,
          validAppDelegateSwift,
          'swift',
        );

        // -- Act --
        const result =
          exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

        // -- Assert --
        expect(result).toBe(filePath);
      });
    });

    describe('SwiftUI file found', () => {
      describe('is app delegate', () => {
        it('should return the file path', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = prepareAppDelegateFile(
            tempDir,
            validAppDelegateSwiftUI,
            'swift',
          );

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBe(filePath);
        });
      });

      describe('is not app delegate', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          prepareAppDelegateFile(tempDir, invalidAppDelegateSwiftUI, 'swift');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });
    });

    describe('Swift file found', () => {
      describe('is app delegate', () => {
        it('should return the file path', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = prepareAppDelegateFile(
            tempDir,
            validAppDelegateSwift,
            'swift',
          );

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBe(filePath);
        });
      });

      describe('is not app delegate', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          prepareAppDelegateFile(tempDir, invalidAppDelegateSwift, 'swift');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });
    });

    describe('Objective-C file found', () => {
      describe('is app delegate', () => {
        it('should return the file path', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = prepareAppDelegateFile(
            tempDir,
            validAppDelegateObjC,
            'm',
          );

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBe(filePath);
        });
      });

      describe('is not app delegate', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          prepareAppDelegateFile(tempDir, invalidAppDelegateObjC, 'm');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });
    });

    describe('Objective-C++ file found', () => {
      describe('is app delegate', () => {
        it('should return the file path', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = prepareAppDelegateFile(
            tempDir,
            validAppDelegateObjC,
            'mm',
          );

          // -- Act --
          const result = exportForTesting.findAppDidFinishLaunchingWithOptions(
            tempDir,
            [filePath],
          );

          // -- Assert --
          expect(result).toBe(filePath);
        });
      });

      describe('is not app delegate', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          prepareAppDelegateFile(tempDir, invalidAppDelegateObjC, 'mm');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });
    });

    describe('file in list not found', () => {
      it('should return null', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();
        const filePath = prepareAppDelegateFile(
          tempDir,
          invalidAppDelegateSwift,
          'swift',
        );

        // -- Act --
        const result = exportForTesting.findAppDidFinishLaunchingWithOptions(
          tempDir,
          [filePath],
        );

        // -- Assert --
        expect(result).toBeNull();
      });
    });

    describe('unrelated file found', () => {
      it('should be ignored', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();
        const filePath = prepareAppDelegateFile(
          tempDir,
          invalidAppDelegateSwift,
          'swift',
        );

        // -- Act --
        const result = exportForTesting.findAppDidFinishLaunchingWithOptions(
          tempDir,
          [filePath],
        );

        // -- Assert --
        expect(result).toBeNull();
      });
    });

    describe('directory in list', () => {
      describe('name starts with dot', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();

          const hiddenDir = path.join(tempDir, '.hidden');
          fs.mkdirSync(hiddenDir);

          prepareAppDelegateFile(hiddenDir, validAppDelegateSwift, 'swift');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });

      describe('name ends with .xcodeproj', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const xcodeDir = path.join(tempDir, 'MyProject.xcodeproj');
          fs.mkdirSync(xcodeDir);

          prepareAppDelegateFile(xcodeDir, validAppDelegateSwift, 'swift');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });

      describe('name ends with .xcassets', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const xcassetsDir = path.join(tempDir, 'MyProject.xcassets');
          fs.mkdirSync(xcassetsDir);

          prepareAppDelegateFile(xcassetsDir, validAppDelegateSwift, 'swift');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });

      describe('is not a directory', () => {
        it('should be ignored', () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = path.join(tempDir, 'some-file');
          fs.writeFileSync(filePath, validAppDelegateSwift, 'utf8');

          // -- Act --
          const result =
            exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

          // -- Assert --
          expect(result).toBeNull();
        });
      });
    });

    describe('multiple files could be app delegate', () => {
      it('should return the first one', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();
        const filePath = prepareAppDelegateFile(
          tempDir,
          validAppDelegateSwift,
          'swift',
        );
        prepareAppDelegateFile(tempDir, validAppDelegateSwift, 'swift');

        // -- Act --
        const result =
          exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

        // -- Assert --
        expect(result).toBe(filePath);
      });
    });

    describe('multiple nested directories with app delegate', () => {
      it('should return the first one', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();

        const nestedDir = path.join(tempDir, 'nested');
        fs.mkdirSync(nestedDir);
        const nestedFilePath = prepareAppDelegateFile(
          nestedDir,
          validAppDelegateSwift,
          'swift',
        );

        const nestedDir2 = path.join(tempDir, 'nested2');
        fs.mkdirSync(nestedDir2);
        prepareAppDelegateFile(nestedDir2, validAppDelegateSwift, 'swift');

        // -- Act --
        const result =
          exportForTesting.findAppDidFinishLaunchingWithOptions(tempDir);

        // -- Assert --
        expect(result).toBe(nestedFilePath);
      });
    });

    describe('no app delegate found', () => {
      it('should return null', () => {
        // -- Arrange --
        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'code-tools-test'),
        );

        // -- Act --
        const result = exportForTesting.findAppDidFinishLaunchingWithOptions(
          tempDir,
          [],
        );

        // -- Assert --
        expect(result).toBeNull();
      });
    });
  });

  describe('#addCodeSnippetToProject', () => {
    describe('app delegate file is not found', () => {
      it('should return false', () => {
        // -- Arrange --
        const tempDir = prepareTempDir();

        // -- Act --
        const result = addCodeSnippetToProject(
          tempDir,
          ['AppDelegate.swift'],
          'https://example.com/sentry-dsn',
        );

        // -- Assert --
        expect(result).toBeFalsy();
      });
    });

    describe('app delegate file is found', () => {
      let tempDir: string;
      let appDelegatePath: string;

      beforeEach(() => {
        // -- Arrange --
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-tools-test'));
        appDelegatePath = path.join(tempDir, 'AppDelegate.swift');
        fs.writeFileSync(appDelegatePath, validAppDelegateSwift, 'utf8');
      });

      describe('is Swift file', () => {
        describe('Sentry is not initialized', () => {
          let tempDir: string;
          let filePath: string;

          beforeEach(() => {
            tempDir = prepareTempDir();
            filePath = prepareAppDelegateFile(
              tempDir,
              validAppDelegateSwift,
              'swift',
            );
          });

          it('should add the code snippet', () => {
            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
            expect(modifiedFileContent).toBe(validAppDelegateSwiftWithSentry);
          });

          it("should set tag 'code-language'", () => {
            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            expect(Sentry.setTag).toHaveBeenCalledWith(
              'code-language',
              'swift',
            );
          });

          it("should set tag 'ui-engine'", () => {
            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            expect(Sentry.setTag).toHaveBeenCalledWith('ui-engine', 'uikit');
          });
        });

        describe('Sentry is already initialized', () => {
          it('should not add the code snippet', () => {
            // -- Arrange --
            const tempDir = prepareTempDir();
            const filePath = prepareAppDelegateFile(
              tempDir,
              validAppDelegateSwiftWithSentry,
              'swift',
            );

            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
            expect(modifiedFileContent).toBe(validAppDelegateSwiftWithSentry);
          });
        });

        describe('is SwiftUI file', () => {
          describe('Sentry is not initialized', () => {
            let tempDir: string;
            let filePath: string;

            beforeEach(() => {
              tempDir = prepareTempDir();
              filePath = prepareAppDelegateFile(
                tempDir,
                validAppDelegateSwiftUI,
                'swift',
              );
            });

            it('should add the code snippet', () => {
              // -- Act --
              const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

              // -- Assert --
              expect(result).toBeTruthy();
              const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
              expect(modifiedFileContent).toBe(
                validAppDelegateSwiftUIWithSentry,
              );
            });

            it("should set tag 'code-language'", () => {
              // -- Act --
              const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

              // -- Assert --
              expect(result).toBeTruthy();
              expect(Sentry.setTag).toHaveBeenNthCalledWith(
                1,
                'code-language',
                'swift',
              );
            });

            it("should set tag 'ui-engine'", () => {
              // -- Act --
              const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

              // -- Assert --
              expect(result).toBeTruthy();
              expect(Sentry.setTag).toHaveBeenNthCalledWith(
                2,
                'ui-engine',
                'swiftui',
              );
            });
          });

          describe('Sentry is already initialized', () => {
            it('should not add the code snippet', () => {
              // -- Arrange --
              const tempDir = prepareTempDir();
              const filePath = prepareAppDelegateFile(
                tempDir,
                validAppDelegateSwiftUIWithSentry,
                'swift',
              );

              // -- Act --
              const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

              // -- Assert --
              expect(result).toBeTruthy();
              const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
              expect(modifiedFileContent).toBe(
                validAppDelegateSwiftUIWithSentry,
              );
            });
          });
        });

        describe('is not matching SwiftUI regex', () => {
          it('should not add the code snippet', () => {
            // -- Arrange --
            const tempDir = prepareTempDir();
            const filePath = prepareAppDelegateFile(
              tempDir,
              invalidAppDelegateSwiftUI,
              'swift',
            );

            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeFalsy();
          });
        });
      });

      describe('is Objective-C file', () => {
        describe('Sentry is not initialized', () => {
          it('should add the code snippet', () => {
            // -- Act --
            const tempDir = prepareTempDir();
            const filePath = prepareAppDelegateFile(
              tempDir,
              validAppDelegateObjC,
              'm',
            );

            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
            expect(modifiedFileContent).toBe(validAppDelegateObjCWithSentry);
          });
        });

        describe('Sentry is already initialized', () => {
          let tempDir: string;
          let filePath: string;

          beforeEach(() => {
            tempDir = prepareTempDir();
            filePath = prepareAppDelegateFile(
              tempDir,
              validAppDelegateObjCWithSentry,
              'm',
            );
          });

          it('should not add the code snippet', () => {
            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            const modifiedFileContent = fs.readFileSync(filePath, 'utf8');
            expect(modifiedFileContent).toBe(validAppDelegateObjCWithSentry);
          });

          it('should log info', () => {
            // -- Act --
            const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

            // -- Assert --
            expect(result).toBeTruthy();
            expect(clack.log.info).toHaveBeenCalledWith(
              'Sentry is already initialized in your AppDelegate. Skipping adding the code snippet.',
            );
          });
        });

        it("should set tag 'code-language'", () => {
          // -- Arrange --
          const tempDir = prepareTempDir();
          const filePath = prepareAppDelegateFile(
            tempDir,
            validAppDelegateObjC,
            'm',
          );

          // -- Act --
          const result = addCodeSnippetToProject(tempDir, [filePath], dsn);

          // -- Assert --
          expect(result).toBeTruthy();
          expect(Sentry.setTag).toHaveBeenCalledWith('code-language', 'objc');
        });
      });
    });
  });
});
