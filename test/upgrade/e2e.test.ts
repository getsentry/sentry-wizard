import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { discoverFiles } from '../../src/upgrade/file-discovery.js';
import { runCodemodsOnFiles } from '../../src/upgrade/codemod-runner.js';
import { v8ToV9Codemods } from '../../src/upgrade/codemods/v8-to-v9/index.js';

describe('upgrade e2e: v8 → v9', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-upgrade-e2e-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  function writeFile(name: string, content: string): void {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  function readFile(name: string): string {
    return fs.readFileSync(path.join(tmpDir, name), 'utf-8');
  }

  it('transforms a full v8 project to v9', async () => {
    // package.json with v8 deps
    writeFile(
      'package.json',
      JSON.stringify({
        dependencies: {
          '@sentry/browser': '^8.40.0',
          '@sentry/utils': '^8.40.0',
        },
      }),
    );

    // File with multiple v8 patterns
    writeFile(
      'src/sentry.ts',
      `import * as Sentry from "@sentry/browser";
import { logger } from "@sentry/utils";

Sentry.init({
  dsn: "__DSN__",
  enableTracing: true,
});

Sentry.getCurrentHub().captureException(new Error("test"));
Sentry.captureUserFeedback({ comments: "bug", name: "Jane" });
`,
    );

    // File with CJS require
    writeFile(
      'src/legacy.js',
      `const { addBreadcrumb } = require("@sentry/utils");
addBreadcrumb({ message: "hello" });
`,
    );

    // File without sentry (should be skipped)
    writeFile('src/other.ts', `console.log("no sentry here");`);

    // Run discovery + codemods
    const files = await discoverFiles(tmpDir);
    expect(files).toHaveLength(2);

    const result = await runCodemodsOnFiles(files, v8ToV9Codemods);
    expect(result.filesModified).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Verify sentry.ts transforms
    const sentryTs = readFile('src/sentry.ts');
    // Package remapping
    expect(sentryTs).toContain('"@sentry/core"');
    expect(sentryTs).not.toContain('"@sentry/utils"');
    // enableTracing replaced (the string still appears in the TODO comment, but not as a config key)
    expect(sentryTs).not.toContain('enableTracing: true');
    expect(sentryTs).toContain('tracesSampleRate');
    // Hub removal
    expect(sentryTs).not.toContain('getCurrentHub');
    expect(sentryTs).toContain('Sentry.captureException');
    // Method rename
    expect(sentryTs).not.toContain('captureUserFeedback');
    expect(sentryTs).toContain('captureFeedback');
    expect(sentryTs).toContain('message: "bug"');

    // Verify legacy.js transforms
    const legacyJs = readFile('src/legacy.js');
    expect(legacyJs).toContain('"@sentry/core"');
    expect(legacyJs).not.toContain('"@sentry/utils"');
  });

  it('reports manual review items for complex patterns', async () => {
    writeFile(
      'package.json',
      JSON.stringify({ dependencies: { '@sentry/browser': '^8.0.0' } }),
    );

    writeFile(
      'src/app.ts',
      `import * as Sentry from "@sentry/browser";
const hub = Sentry.getCurrentHub();
hub.captureException(new Error("stored hub ref"));
`,
    );

    const files = await discoverFiles(tmpDir);
    const result = await runCodemodsOnFiles(files, v8ToV9Codemods);

    expect(result.manualReviewItems.length).toBeGreaterThan(0);
    expect(result.manualReviewItems[0].description).toContain('getCurrentHub');
  });

  it('skips node_modules and dist', async () => {
    writeFile(
      'package.json',
      JSON.stringify({ dependencies: { '@sentry/browser': '^8.0.0' } }),
    );

    writeFile(
      'node_modules/@sentry/browser/index.js',
      `import * as Sentry from "@sentry/utils";`,
    );

    writeFile('dist/bundle.js', `import * as Sentry from "@sentry/utils";`);

    const files = await discoverFiles(tmpDir);
    expect(files).toHaveLength(0);
  });
});
