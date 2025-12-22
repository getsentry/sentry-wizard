// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { findWranglerConfig } from './find-wrangler-config';
import { makeCodeSnippet, showCopyPasteInstructions } from '../../utils/clack';
import {
  getObjectProperty,
  parseJsonC,
  printJsonC,
  setOrUpdateObjectProperty,
} from '../../utils/ast-utils';
import * as recast from 'recast';

const b = recast.types.builders;

type WranglerConfigUpdates = {
  compatibility_date?: string;
  compatibility_flags?: string[];
  version_metadata?: {
    binding: string;
  };
  [key: string]: unknown;
};

const getTomlConfigSnippet = () => {
  return makeCodeSnippet(true, (unchanged, plus) =>
    plus(
      `
compatibility_flags = ["nodejs_als"]
compatibility_date = "${new Date().toISOString().slice(0, 10)}"

[version_metadata]
binding = "CF_VERSION_METADATA"`,
    ),
  );
};

/**
 * Updates the wrangler config file with the provided configuration
 * Handles .toml (instructions only), .json, and .jsonc formats
 * For arrays: merges and deduplicates values
 * For objects: deep merges
 * For other types: overwrites
 */
export async function updateWranglerConfig(
  updates: WranglerConfigUpdates,
): Promise<boolean> {
  const configFile = findWranglerConfig();

  if (!configFile) {
    clack.log.warn('No wrangler config file found.');

    return false;
  }

  const configPath = path.join(process.cwd(), configFile);

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const extname = path.extname(configFile);

    switch (extname) {
      case '.jsonc':
      case '.json':
        updateJsoncConfig(configPath, configContent, updates);
        clack.log.success(
          `Updated ${chalk.cyan(configFile)} with Sentry configuration.`,
        );

        break;
      case '.toml':
        await showCopyPasteInstructions({
          filename: configFile,
          codeSnippet: getTomlConfigSnippet(),
        });
        break;
    }

    return true;
  } catch (error) {
    clack.log.error(
      `Failed to update ${chalk.cyan(configFile)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

/**
 * Sets a string property in a JSON/JSONC config object.
 * Overwrites any existing value.
 *
 * @param jsonObject The object expression to update
 * @param propertyName The name of the string property
 * @param value The string value to set
 */
function setStringProperty(
  jsonObject: recast.types.namedTypes.ObjectExpression,
  propertyName: string,
  value: string,
): void {
  setOrUpdateObjectProperty(jsonObject, propertyName, b.stringLiteral(value));
}

/**
 * Merges an array property in a JSON/JSONC config object.
 * Extracts existing array values, merges with new values, and deduplicates.
 *
 * @param jsonObject The object expression to update
 * @param propertyName The name of the array property
 * @param newValues The new array values to merge in
 */
function mergeArrayProperty(
  jsonObject: recast.types.namedTypes.ObjectExpression,
  propertyName: string,
  newValues: string[],
): void {
  const existingProperty = getObjectProperty(jsonObject, propertyName);
  const existingValues: string[] = [];

  // Extract existing values from the AST if they exist
  if (existingProperty && existingProperty.value.type === 'ArrayExpression') {
    existingProperty.value.elements.forEach((element) => {
      if (
        element &&
        (element.type === 'StringLiteral' || element.type === 'Literal') &&
        typeof element.value === 'string'
      ) {
        existingValues.push(element.value);
      }
    });
  }

  // Merge existing and new values, deduplicate
  const allValues = [...existingValues, ...newValues];
  const uniqueValues = Array.from(new Set(allValues));

  setOrUpdateObjectProperty(
    jsonObject,
    propertyName,
    b.arrayExpression(uniqueValues.map((value) => b.stringLiteral(value))),
  );
}

/**
 * Merges properties into a nested object property in a JSON/JSONC config object.
 * Gets or creates the nested ObjectExpression if it doesn't exist,
 * then merges the provided properties into it, preserving existing properties.
 *
 * @param jsonObject The object expression to update
 * @param propertyName The name of the nested object property
 * @param updates The properties to merge into the nested object
 */
function setObjectProperty<T extends object>(
  jsonObject: recast.types.namedTypes.ObjectExpression,
  propertyName: string,
  updates: T,
): void {
  const existingProperty = getObjectProperty(jsonObject, propertyName);
  let nestedObject: recast.types.namedTypes.ObjectExpression;

  if (existingProperty && existingProperty.value.type === 'ObjectExpression') {
    nestedObject = existingProperty.value;
  } else {
    nestedObject = b.objectExpression([]);
    setOrUpdateObjectProperty(jsonObject, propertyName, nestedObject);
  }

  updateJsoncObject(nestedObject, updates);
}

function updateJsoncObject<T extends object>(
  jsonObject: recast.types.namedTypes.ObjectExpression,
  updates: T,
): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      setStringProperty(jsonObject, key, value);
    } else if (Array.isArray(value)) {
      mergeArrayProperty(jsonObject, key, value as string[]);
    } else if (typeof value === 'object') {
      setObjectProperty(jsonObject, key, value);
    }
  }
}

/**
 * Updates a JSON/JSONC config file using jsonc-parser
 * Preserves comments and formatting while merging values
 */
function updateJsoncConfig(
  configPath: string,
  content: string,
  updates: WranglerConfigUpdates,
): void {
  const { jsonObject, ast } = parseJsonC(content);

  if (!jsonObject) {
    throw new Error('Failed to parse JSON/JSONC config file');
  }

  updateJsoncObject(jsonObject, updates);

  const code = printJsonC(ast);

  fs.writeFileSync(configPath, code, 'utf-8');
}
