// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import fs from 'node:fs';
import * as jsonc from 'jsonc-parser';
import path from 'node:path';
// @ts-expect-error - smol-toml is ESM and TS complains about that. It works though
import * as smolToml from 'smol-toml';
import { findWranglerConfig } from './find-wrangler-config';

type WranglerConfigUpdates = {
  compatibility_date?: string;
  compatibility_flags?: string[];
  version_metadata?: {
    binding: string;
  };
  [key: string]: unknown;
};

/**
 * Updates the wrangler config file with the provided configuration
 * Handles .toml, .json, and .jsonc formats
 * For arrays: merges and deduplicates values
 * For objects: deep merges
 * For other types: overwrites
 */
export function updateWranglerConfig(updates: WranglerConfigUpdates): boolean {
  const configFile = findWranglerConfig();
  if (!configFile) {
    clack.log.warn('No wrangler config file found.');
    return false;
  }

  const configPath = path.join(process.cwd(), configFile);

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');

    if (configFile.endsWith('.toml')) {
      updateTomlConfig(configPath, configContent, updates);
    } else if (configFile.endsWith('.jsonc') || configFile.endsWith('.json')) {
      updateJsoncConfig(configPath, configContent, updates);
    }

    clack.log.success(
      `Updated ${chalk.cyan(configFile)} with Sentry configuration.`,
    );
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
 * Updates a TOML config file using smol-toml
 * Merges arrays or overwrites other values
 */
function updateTomlConfig(
  configPath: string,
  content: string,
  updates: WranglerConfigUpdates,
): void {
  const parsed = smolToml.parse(content);

  for (const [key, value] of Object.entries(updates)) {
    parsed[key] = mergeValue<smolToml.TomlValue>(
      parsed[key],
      value as smolToml.TomlValue,
    );
  }

  const updatedContent = smolToml.stringify(parsed);

  fs.writeFileSync(configPath, updatedContent, 'utf-8');
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
  // Parse the JSONC to get existing values
  const existingConfig = jsonc.parse(content) as Record<string, unknown>;

  // Apply all modifications using jsonc-parser's modify function
  let updatedContent = content;
  const formattingOptions: jsonc.FormattingOptions = {
    tabSize: 2,
    insertSpaces: true,
    eol: '\n',
  };

  for (const [key, value] of Object.entries(updates)) {
    const mergedValue = mergeValue(existingConfig[key], value);
    const edits = jsonc.modify(updatedContent, [key], mergedValue, {
      formattingOptions,
    });

    updatedContent = jsonc.applyEdits(updatedContent, edits);
  }

  fs.writeFileSync(configPath, updatedContent, 'utf-8');
}

/**
 * Merges a new value with an existing value
 * For arrays: merges and deduplicates
 * For objects: shallow merges
 * For other types: overwrites
 */
function mergeValue<T = unknown>(existingValue: T, newValue: T): T {
  if (Array.isArray(existingValue) && Array.isArray(newValue)) {
    return [...new Set([...existingValue, ...newValue])] as T;
  }

  if (
    typeof existingValue === 'object' &&
    existingValue !== null &&
    !Array.isArray(existingValue) &&
    typeof newValue === 'object' &&
    newValue !== null &&
    !Array.isArray(newValue)
  ) {
    return { ...existingValue, ...newValue };
  }

  return newValue;
}
