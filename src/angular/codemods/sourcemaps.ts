// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as path from 'path';
import * as fs from 'fs';
import {
  angularJsonTemplate,
  configureAngularSourcemapGenerationFlow,
} from '../../sourcemaps/tools/angular';

interface PartialAngularJson {
  projects?: {
    [key: string]: {
      architect?: {
        build?: {
          configurations?: {
            production?: {
              sourceMap?: boolean;
            };
          };
        };
      };
    };
  };
}

export async function addSourcemapEntryToAngularJSON(): Promise<void> {
  const angularJsonPath = path.join(process.cwd(), 'angular.json');
  const angularJSONFile = fs.readFileSync(angularJsonPath, 'utf-8');
  const angularJson = JSON.parse(angularJSONFile) as PartialAngularJson;

  if (!angularJson || typeof angularJson !== 'object') {
    await configureAngularSourcemapGenerationFlow();
  }

  const projects = Object.keys(angularJson.projects as Record<string, unknown>);

  if (!projects.length) {
    await configureAngularSourcemapGenerationFlow();
  }

  // Emit sourcemaps from all projects in angular.json
  for (const project of projects) {
    const projectConfig = angularJson.projects?.[project] || {};

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
      sourceMap: true,
    };
  }

  try {
    fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2));
  } catch (error) {
    clack.log.error(`Failed to write sourcemap configuration to angular.json`);
    clack.log
      .warn(`Please add the following configuration to your angular.json file:
        ${angularJsonTemplate}`);
  }
}
