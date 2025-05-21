import {
  DIST_DIR,
  findOutDir,
  getSentryCliCommand,
  safeInsertArgsToWranglerDeployCommand,
} from '../../../src/sourcemaps/tools/wrangler';
import { describe, expect, it } from 'vitest';

describe('getSentryCliCommand', () => {
  it('returns correct command for SaaS', () => {
    const command = getSentryCliCommand({
      selfHosted: false,
      orgSlug: 'myOrg',
      projectSlug: 'myProject',
      url: 'https://sentry.io',
      authToken: '_ignore',
      outDir: 'dist',
    });

    expect(command).toBe(
      "_SENTRY_RELEASE=$(sentry-cli releases propose-version) && sentry-cli releases new $_SENTRY_RELEASE --org=myOrg --project=myProject && sentry-cli sourcemaps upload --org=myOrg --project=myProject --release=$_SENTRY_RELEASE --strip-prefix 'dist/..' dist",
    );
  });

  it('returns correct command for self-hosted', () => {
    const command = getSentryCliCommand({
      selfHosted: true,
      orgSlug: 'myOrg',
      projectSlug: 'myProject',
      url: 'https://santry.io',
      authToken: '_ignore',
      outDir: 'someplace',
    });

    expect(command).toBe(
      "_SENTRY_RELEASE=$(sentry-cli releases propose-version) && sentry-cli --url https://santry.io releases new $_SENTRY_RELEASE --org=myOrg --project=myProject && sentry-cli --url https://santry.io sourcemaps upload --org=myOrg --project=myProject --release=$_SENTRY_RELEASE --strip-prefix 'someplace/..' someplace",
    );
  });
});

describe('safeInsertArgsToWranglerDeployCommand', () => {
  it('correctly inserts args into default command', () => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      'wrangler deploy',
      'dist',
    );

    expect(newCommand).toBe(
      'wrangler deploy --outdir dist --upload-source-maps --var SENTRY_RELEASE:$(sentry-cli releases propose-version)',
    );
  });

  it.each([
    '--outdir someplace',
    '--outdir=someplace',
    '--outdir="./someplace"',
  ])('retains existing %s arg', (arg) => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      `wrangler deploy ${arg}`,
      'dist',
    );

    expect(newCommand).toBe(
      `wrangler deploy --upload-source-maps --var SENTRY_RELEASE:$(sentry-cli releases propose-version) ${arg}`,
    );
  });

  it.each([
    '--upload-source-maps',
    '--upload-source-maps=true',
    '--upload-source-maps true',
    '--upload-source-maps=false',
    '--upload-source-maps false',
  ])('retains existing %s arg', (arg) => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      `wrangler deploy ${arg}`,
      'dist',
    );

    expect(newCommand).toBe(
      `wrangler deploy --outdir dist --var SENTRY_RELEASE:$(sentry-cli releases propose-version) ${arg}`,
    );
  });

  it('inserts args directly after "wrangler deploy" command', () => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      'precheck && wrangler  deploy --outdir dist --upload-source-maps --var SOMEVAR:someValue && postcheck',
      'dist',
    );

    expect(newCommand).toBe(
      'precheck && wrangler deploy --var SENTRY_RELEASE:$(sentry-cli releases propose-version) --outdir dist --upload-source-maps --var SOMEVAR:someValue && postcheck',
    );
  });

  it('handles multiple wrangler commands', () => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      'wrangler whoami && wrangler deploy --outdir dist --upload-source-maps --var SOMEVAR:someValue && wrangler someothercommand',
      'dist',
    );

    expect(newCommand).toBe(
      'wrangler whoami && wrangler deploy --var SENTRY_RELEASE:$(sentry-cli releases propose-version) --outdir dist --upload-source-maps --var SOMEVAR:someValue && wrangler someothercommand',
    );
  });

  it('handles wrangler deploy command with global args', () => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      'wrangler --version --env production deploy --outdir someplace',
      'dist',
    );

    expect(newCommand).toBe(
      'wrangler --version --env production deploy --upload-source-maps --var SENTRY_RELEASE:$(sentry-cli releases propose-version) --outdir someplace',
    );
  });

  it('handles multiple commands and wrangler deploy command with global args', () => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(
      'notwrangler --version deploy && wrangler --version --env whoami && wrangler --version --env production deploy --outdir someplace',
      'dist',
    );

    expect(newCommand).toBe(
      'notwrangler --version deploy && wrangler --version --env whoami && wrangler --version --env production deploy --upload-source-maps --var SENTRY_RELEASE:$(sentry-cli releases propose-version) --outdir someplace',
    );
  });

  it.each([
    'notwrangler deploy',
    'wrangler dev',
    'wrangler dev && notwrangler deploy',
    'wrangler dev ; notwrangler deploy',
    'wrangler dev; notwrangler deploy',
    'wrangler dev ;notwrangler deploy',
    'wrangler --env dev dev && notwrangler deploy',
    'some completely different command',
  ])('returns undefined if deploy command is not found', (command) => {
    const newCommand = safeInsertArgsToWranglerDeployCommand(command, 'dist');

    expect(newCommand).toBeUndefined();
  });
});

describe('findOutDir', () => {
  it('returns dist dir if no outdir arg is found', () => {
    const outDir = findOutDir('wrangler deploy');

    expect(outDir).toBe(DIST_DIR);
  });

  it('returns outdir arg if it is found', () => {
    const outDir = findOutDir('wrangler deploy --outdir someplace');

    expect(outDir).toBe('someplace');
  });

  it('handles --outdir "./someplace"', () => {
    const outDir = findOutDir('wrangler deploy --outdir "./someplace"');

    expect(outDir).toBe('./someplace');
  });

  it('handles --outdir=someplace', () => {
    const outDir = findOutDir('wrangler deploy --outdir=someplace');

    expect(outDir).toBe('someplace');
  });

  it("handles --outdir='./someplace'", () => {
    const outDir = findOutDir('wrangler deploy --outdir="./someplace"');

    expect(outDir).toBe('./someplace');
  });
});
