/// <reference types="jest" />
import * as fs from 'fs';
import * as path from 'path';

import { mergeConfigFile } from '../MergeConfig';

const configPath = path.join(__dirname, '..', 'test-fixtures/next.config.js');
const templatePath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts/NextJs/configs/next.config.template.js',
);

function configFileNames(num: number): {
  sourcePath: string;
  mergedPath: string;
} {
  const sourcePath = path.join(
    __dirname,
    '..',
    `test-fixtures/next.config.${num}.js`,
  );
  const mergedPath = path.join(
    __dirname,
    '..',
    `test-fixtures/next.config.${num}-merged.js`,
  );
  return { sourcePath, mergedPath };
}

describe('Merging next.config.js', () => {

  afterEach(() => {
    fs.unlinkSync(configPath);
  });

  test('merge basic next.config.js return true', () => {
    const { sourcePath, mergedPath } = configFileNames(1);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
  });

  test('merge basic next.config.js', () => {
    const { sourcePath, mergedPath } = configFileNames(1);
    fs.copyFileSync(sourcePath, configPath);

    mergeConfigFile(configPath, templatePath);

    expect(fs.readFileSync(configPath, 'utf8')).toEqual(fs.readFileSync(mergedPath, 'utf8'));
  });

  test('merge invalid javascript config return false', () => {
    const { sourcePath } = configFileNames(2);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(false);
  });

  test('merge more complicated next.config.js return true', () => {
    const { sourcePath } = configFileNames(3);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
  });

  test('merge more complicated next.config.js', () => {
    const { sourcePath, mergedPath } = configFileNames(3);
    fs.copyFileSync(sourcePath, configPath);

    mergeConfigFile(configPath, templatePath);

    expect(fs.readFileSync(configPath, 'utf8')).toEqual(fs.readFileSync(mergedPath, 'utf8'));
  });

  test('merge next.config.js with function return true', () => {
    const { sourcePath } = configFileNames(4);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
  });

  test('merge next.config.js with function', () => {
    const { sourcePath, mergedPath } = configFileNames(4);
    fs.copyFileSync(sourcePath, configPath);

    mergeConfigFile(configPath, templatePath);

    expect(fs.readFileSync(configPath, 'utf8')).toEqual(fs.readFileSync(mergedPath, 'utf8'));
  });
});
