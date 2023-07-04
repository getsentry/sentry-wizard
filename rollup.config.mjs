import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import modulePackage from 'module';
import { readFileSync } from 'fs';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url)),
);

const extensions = ['.ts'];

export default [
  {
    input: ['./bin.ts'],
    external: [
      ...Object.keys(packageJson.dependencies),
      ...modulePackage.builtinModules,
    ],
    // onwarn: (warning) => {
    //   throw new Error(warning.message); // Warnings are usually high-consequence for us so let's throw to catch them
    // },
    plugins: [
      resolve({
        extensions,
        rootDir: '.',
        preferBuiltins: true,
      }),
      json(),
      babel({
        extensions,
        babelHelpers: 'bundled',
        include: ['./**/*'],
      }),
      commonjs(),
    ],
    output: [
      {
        file: packageJson.bin['sentry-wizard'],
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
    ],
  },
  {
    input: ['./index.ts'],
    external: [
      ...Object.keys(packageJson.dependencies),
      ...modulePackage.builtinModules,
    ],
    // onwarn: (warning) => {
    //   throw new Error(warning.message); // Warnings are usually high-consequence for us so let's throw to catch them
    // },
    plugins: [
      resolve({
        extensions,
        rootDir: '.',
        preferBuiltins: false,
      }),
      json(),
      typescript({ noForceEmit: true }),
      babel({
        extensions,
        babelHelpers: 'bundled',
        include: ['./**/*'],
      }),
      commonjs(),
    ],
    output: [
      {
        file: packageJson.main,
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
    ],
  },
];
