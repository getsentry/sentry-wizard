/// <reference types="jest" />
import * as fs from 'fs';
import * as path from 'path';

import { mergeConfigFile } from '../MergeConfig';

const configPath = path.join(__dirname, '..', 'Configs/next.config.js');
const templatePath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts/NextJS/configs/next.config.template.js',
);

function configFileNames(num: number): {
  sourcePath: string;
  mergedPath: string;
} {
  const sourcePath = path.join(
    __dirname,
    '..',
    `Configs/next.config.${num}.js`,
  );
  const mergedPath = path.join(
    __dirname,
    '..',
    `Configs/next.config.${num}-merged.js`,
  );
  return { sourcePath, mergedPath };
}

describe('Merging next.config.js', () => {
  test('merge basic next.config.js', () => {
    const { sourcePath, mergedPath } = configFileNames(1);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
    expect(
      fs.readFileSync(configPath, 'utf8') ===
        fs.readFileSync(mergedPath, 'utf8'),
    ).toBe(true);
    fs.unlinkSync(configPath);
  });

  test('merge invalid javascript config', () => {
    const { sourcePath } = configFileNames(2);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(false);
    fs.unlinkSync(configPath);
  });

  test('merge more complicated next.config.js', () => {
    const { sourcePath, mergedPath } = configFileNames(3);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
    expect(
      fs.readFileSync(configPath, 'utf8') ===
        fs.readFileSync(mergedPath, 'utf8'),
    ).toBe(true);
    fs.unlinkSync(configPath);
  });

  test('merge next.config.js with function', () => {
    const { sourcePath, mergedPath } = configFileNames(4);
    fs.copyFileSync(sourcePath, configPath);

    expect(mergeConfigFile(configPath, templatePath)).toBe(true);
    expect(
      fs.readFileSync(configPath, 'utf8') ===
        fs.readFileSync(mergedPath, 'utf8'),
    ).toBe(true);
    fs.unlinkSync(configPath);
  });
});
