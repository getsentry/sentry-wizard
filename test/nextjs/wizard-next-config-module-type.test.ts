import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runNextjsWizardWithTelemetry } from '../../src/nextjs/nextjs-wizard';

vi.mock('@clack/prompts', () => ({
  default: {
    log: {
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      step: vi.fn(),
    },
    outro: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
    select: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../src/utils/clack', () => ({
  abort: vi.fn(),
  abortIfCancelled: vi.fn((value: unknown) => value),
  addDotEnvSentryBuildPluginFile: vi.fn(),
  askShouldCreateExamplePage: vi.fn().mockResolvedValue(false),
  confirmContinueIfNoOrDirtyGitRepo: vi.fn(),
  createNewConfigFile: vi.fn(),
  ensurePackageIsInstalled: vi.fn(),
  featureSelectionPrompt: vi.fn().mockResolvedValue({}),
  getOrAskForProjectData: vi.fn().mockResolvedValue({ spotlight: true }),
  getPackageDotJson: vi.fn().mockResolvedValue({}),
  getPackageManager: vi.fn().mockResolvedValue({ runScriptCommand: 'npm run' }),
  installPackage: vi.fn().mockResolvedValue({}),
  printSdkV11MigrationGuideIfOutdated: vi.fn(),
  isUsingTypeScript: vi.fn().mockReturnValue(false),
  makeCodeSnippet: vi.fn(),
  printWelcome: vi.fn(),
  runFormatters: vi.fn(),
  showCopyPasteInstructions: vi.fn(),
}));

vi.mock('../../src/utils/clack/mcp-config', () => ({
  offerProjectScopedMcpConfig: vi.fn(),
}));

vi.mock('../../src/sourcemaps/sourcemaps-wizard', () => ({
  setupCI: vi.fn(),
}));

vi.mock('../../src/telemetry', () => ({
  traceStep: vi.fn((_name: string, callback: () => unknown) => callback()),
  withTelemetry: vi.fn(),
}));

describe('Next.js wizard with an existing next.config.js', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-config-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  async function runWizardOn(packageJson: object, nextConfig: string) {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson),
    );
    fs.writeFileSync(path.join(projectDir, 'next.config.js'), nextConfig);

    await runNextjsWizardWithTelemetry({ telemetryEnabled: false });

    return fs.readFileSync(path.join(projectDir, 'next.config.js'), 'utf8');
  }

  it('wraps it as ESM when package.json has "type": "module"', async () => {
    const result = await runWizardOn(
      { type: 'module' },
      'export default {};\n',
    );

    expect(result).toMatch(/import\s*{\s*withSentryConfig\s*}\s*from/);
    expect(result).toContain('export default withSentryConfig(');
    expect(result).not.toContain('require(');
    expect(result).not.toContain('module.exports');
  });

  it('appends CommonJS code without "type": "module"', async () => {
    const result = await runWizardOn({}, 'module.exports = {};\n');

    expect(result).toContain('const { withSentryConfig } = require(');
    expect(result).toContain('module.exports = withSentryConfig(');
  });
});
