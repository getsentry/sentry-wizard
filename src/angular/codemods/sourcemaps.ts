// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as path from 'path';
import * as fs from 'fs';
import { configureAngularSourcemapGenerationFlow } from '../../sourcemaps/tools/angular';
import { captureException } from '@sentry/node';

interface PartialAngularJson {
  projects?: {
    [key: string]: {
      architect?: {
        build?: {
          configurations?: {
            production?: {
              sourceMap?: boolean;
            } & Record<string, unknown>;
          };
        };
      };
    };
  };
}

export async function addSourcemapEntryToAngularJSON(): Promise<void> {
  const angularJsonPath = path.join(process.cwd(), 'angular.json');
  const angularJson = getParsedAngularJson(angularJsonPath);

  if (!angularJson || typeof angularJson !== 'object') {
    await configureAngularSourcemapGenerationFlow();
    return;
  }

  const updatedAngularJson = addSourceMapsSetting(angularJson);

  if (!updatedAngularJson) {
    await configureAngularSourcemapGenerationFlow();
    return;
  }

  try {
    fs.writeFileSync(
      angularJsonPath,
      JSON.stringify(updatedAngularJson, null, 2),
    );
  } catch (error) {
    clack.log.error(`Failed to write sourcemap configuration to angular.json`);
    captureException('Failed to write sourcemap configuration to angular.json');
    await configureAngularSourcemapGenerationFlow();
  }
}

/**
 * Extracted from `addSourcemapEntryToAngularJSON` and exported to allow for easier testing.
 */
export function addSourceMapsSetting(
  angularJson: PartialAngularJson,
): PartialAngularJson | undefined {
  const newAngularJson = { ...angularJson };

  const projectKeys = Object.keys(newAngularJson.projects || {});

  if (!projectKeys.length || !newAngularJson.projects) {
    return undefined;
  }

  // Emit sourcemaps from all projects in angular.json
  for (const projectKey of projectKeys) {
    const projectConfig = newAngularJson.projects[projectKey];

    if (!projectConfig.architect) {
      projectConfig.architect = {};
    }

    if (!projectConfig.architect.build) {
      projectConfig.architect.build = {};
    }

    if (!projectConfig.architect.build.configurations) {
      projectConfig.architect.build.configurations = {};
    }

    projectConfig.architect.build.configurations.production = {
      ...projectConfig.architect.build.configurations.production,
      sourceMap: true,
    };
  }

  return newAngularJson;
}

function getParsedAngularJson(path: string): PartialAngularJson | undefined {
  try {
    const angularJSONFile = fs.readFileSync(path, 'utf-8');
    return JSON.parse(angularJSONFile) as PartialAngularJson | undefined;
  } catch {
    captureException('Could not parse `angular.json`');
    return undefined;
  }
}
